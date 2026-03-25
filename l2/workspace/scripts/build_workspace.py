#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT_DIR / "config.json"
DIST_DIR = ROOT_DIR / "dist"
LOCAL_DIST_DIR = DIST_DIR / "local"
VALID_PROJECT_TYPES = {"master frontend", "master backend", "client", "lib"}
PROJECT_IMPORT_PATTERN = re.compile(r"""(?P<prefix>\bfrom\s+["']|\bimport\s*\(\s*["'])(?P<specifier>/_\d+_/(?:core|l1|l2)/[^"']+)(?P<suffix>["'](?:\s*\))?)""")
IMPORTMAP_PATTERN = re.compile(r"""\s*<script\s+type=["']importmap["'][^>]*>.*?</script>\s*""", re.DOTALL)
PROJECT_ASSET_URL_PATTERN = re.compile(r"""(?P<prefix>["'(=])(?P<path>/_\d+_/(?:core|l1|l2)/[^"')\s>]+)""")


def log(message: str) -> None:
    print(f"[build_workspace] {message}", flush=True)


def run(command: list[str]) -> None:
    log(f"Running: {' '.join(command)}")
    subprocess.run(command, cwd=ROOT_DIR, check=True)


def relative_to_root(path: Path) -> str:
    return str(path.relative_to(ROOT_DIR))


def load_config() -> dict:
    if not CONFIG_PATH.exists():
      raise RuntimeError(f"config.json not found at {CONFIG_PATH}")

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    projects = config.get("projects", {})
    if not isinstance(projects, dict) or not projects:
        raise RuntimeError("projects/config.json must declare a non-empty 'projects' object.")

    invalid_types: list[str] = []
    clients: list[str] = []
    master_frontends: list[str] = []
    master_backends: list[str] = []
    libs: list[str] = []

    for project_id, project in projects.items():
        project_type = project.get("type")
        if project_type not in VALID_PROJECT_TYPES:
            invalid_types.append(f"{project_id}:{project_type}")
            continue
        if project_type == "client":
            clients.append(project_id)
        elif project_type == "master frontend":
            master_frontends.append(project_id)
        elif project_type == "master backend":
            master_backends.append(project_id)
        elif project_type == "lib":
            libs.append(project_id)

    if invalid_types:
        raise RuntimeError(f"Invalid project type declarations: {', '.join(invalid_types)}")
    if len(clients) != 1:
        raise RuntimeError(f"Workspace must declare exactly one project of type 'client'. Found {len(clients)}.")
    if not master_frontends:
        raise RuntimeError("Workspace must declare at least one project of type 'master frontend'.")
    if not master_backends:
        raise RuntimeError("Workspace must declare at least one project of type 'master backend'.")

    default_project_id = config.get("defaultProjectId")
    if default_project_id not in projects:
        raise RuntimeError(f"defaultProjectId '{default_project_id}' is not declared in projects/config.json.")

    log(
        "Workspace config loaded "
        f"(client={clients[0]}, frontend_masters={len(master_frontends)}, backend_masters={len(master_backends)}, libs={len(libs)}, total_projects={len(projects)})"
    )
    return config


def get_publication_targets(config: dict) -> dict[str, dict]:
    publication = config.get("publication", {})
    targets = publication.get("targets", {})
    if not isinstance(targets, dict) or not targets:
        raise RuntimeError("projects/config.json must declare a non-empty publication.targets object.")
    return targets


def build_dynamic_tsconfig(config: dict) -> dict:
    tsconfig_path = ROOT_DIR / "tsconfig.json"
    tsconfig = json.loads(tsconfig_path.read_text(encoding="utf-8"))
    compiler_options = tsconfig.setdefault("compilerOptions", {})
    dynamic_paths = dict(compiler_options.get("paths", {}))
    dynamic_include: list[str] = []
    compiler_options["noEmit"] = False
    compiler_options["outDir"] = relative_to_root(LOCAL_DIST_DIR)

    for project_id in config["projects"]:
        project_root = ROOT_DIR / f"_{project_id}_"
        for segment in ("core", "l1", "l2"):
            segment_dir = project_root / segment
            if not segment_dir.exists():
                continue

            dynamic_paths[f"/_{project_id}_/{segment}/*"] = [f"_{project_id}_/{segment}/*"]
            dynamic_include.append(f"_{project_id}_/{segment}/**/*.d.ts")
            dynamic_include.append(f"_{project_id}_/{segment}/**/*.ts")

    compiler_options["paths"] = dynamic_paths
    tsconfig["include"] = dynamic_include
    return tsconfig


def clean_dist() -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
        log("Removed existing dist directory")
    else:
        log("dist directory did not exist; clean step skipped")


def build_typescript(config: dict) -> None:
    dynamic_tsconfig = build_dynamic_tsconfig(config)
    with tempfile.NamedTemporaryFile("w", suffix=".json", dir=ROOT_DIR, delete=False, encoding="utf-8") as temp_file:
        json.dump(dynamic_tsconfig, temp_file, indent=2)
        temp_file.write("\n")
        temp_path = Path(temp_file.name)
    try:
        run(["npx", "tsc", "-p", relative_to_root(temp_path)])
    finally:
        temp_path.unlink(missing_ok=True)
    log("TypeScript compilation completed")


def build_tailwind(config: dict) -> None:
    for project_id, project in config["projects"].items():
        if project["type"] != "master frontend":
            continue

        source_file = ROOT_DIR / f"_{project_id}_" / "l2" / "shared" / "tailwind.css"
        if not source_file.exists():
            log(f"Tailwind source not found for frontend master {project_id}; skipping")
            continue

        output_file = LOCAL_DIST_DIR / f"_{project_id}_" / "l2" / "shared" / "tailwind.css"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        workspace_source_lines = [
            f'@source "../../../_{other_project_id}_/l2/**/*.ts";'
            for other_project_id in config["projects"]
            if other_project_id != project_id
        ]
        temp_source_file = source_file.with_name(".tailwind.workspace.css")
        try:
            temp_source_file.write_text(
                source_file.read_text(encoding="utf-8").rstrip() + "\n\n" + "\n".join(workspace_source_lines) + "\n",
                encoding="utf-8",
            )
            run([
                "npx",
                "@tailwindcss/cli",
                "-i",
                relative_to_root(temp_source_file),
                "-o",
                relative_to_root(output_file),
                "--minify",
            ])
        finally:
            temp_source_file.unlink(missing_ok=True)
        log(f"Tailwind build completed for frontend master {project_id}")


def rewrite_absolute_imports(config: dict) -> None:
    for project_id in config["projects"]:
        candidate_paths = [
            ROOT_DIR / f"_{project_id}_" / "l1" / "scripts" / "rewriteProjectAbsoluteImports.mjs",
            ROOT_DIR / f"_{project_id}_" / "scripts" / "rewriteProjectAbsoluteImports.mjs",
        ]
        for candidate in candidate_paths:
            if not candidate.exists():
                continue
            run(["node", relative_to_root(candidate)])
            log(f"Absolute import rewrite completed for project {project_id}")


def rewrite_dist_project_absolute_imports() -> None:
    if not LOCAL_DIST_DIR.exists():
        return

    rewritten_files = 0
    for file_path in LOCAL_DIST_DIR.rglob("*.js"):
        current = file_path.read_text(encoding="utf-8")

        def replace(match: re.Match[str]) -> str:
            specifier = match.group("specifier")
            target_path = LOCAL_DIST_DIR / specifier.lstrip("/")
            relative_target = Path(os.path.relpath(target_path, start=file_path.parent)).as_posix()
            if not relative_target.startswith("."):
                relative_target = f"./{relative_target}"
            return f"{match.group('prefix')}{relative_target}{match.group('suffix')}"

        updated = PROJECT_IMPORT_PATTERN.sub(replace, current)
        if updated == current:
            continue

        file_path.write_text(updated, encoding="utf-8")
        rewritten_files += 1

    if rewritten_files > 0:
        log(f"Generic absolute import rewrite completed for dist (files={rewritten_files})")


def copy_project_sql(config: dict) -> None:
    for project_id in config["projects"]:
        sql_dir = ROOT_DIR / f"_{project_id}_" / "l1" / "sql"
        if not sql_dir.exists():
            continue

        target_dir = LOCAL_DIST_DIR / f"_{project_id}_" / "l1" / "sql"
        target_dir.mkdir(parents=True, exist_ok=True)
        copied_files = 0
        for sql_file in sql_dir.glob("*.sql"):
            shutil.copy2(sql_file, target_dir / sql_file.name)
            copied_files += 1
        log(f"Copied {copied_files} SQL files for project {project_id}")


def copy_frontend_static_files(config: dict) -> None:
    for project_id in config["projects"]:
        l2_dir = ROOT_DIR / f"_{project_id}_" / "l2"
        if not l2_dir.exists():
            continue

        copied_html = 0
        for html_file in l2_dir.rglob("*.html"):
            target_file = LOCAL_DIST_DIR / html_file.relative_to(ROOT_DIR)
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(html_file, target_file)
            copied_html += 1

        copied_assets = 0
        for assets_dir in l2_dir.rglob("assets"):
            if not assets_dir.is_dir():
                continue
            target_dir = LOCAL_DIST_DIR / assets_dir.relative_to(ROOT_DIR)
            shutil.copytree(assets_dir, target_dir, dirs_exist_ok=True)
            copied_assets += 1

        if copied_html > 0 or copied_assets > 0:
            log(f"Copied static frontend files for project {project_id} (html={copied_html}, asset_dirs={copied_assets})")


def copy_project_resources(config: dict) -> None:
    resource_suffixes = {".html", ".css", ".json", ".svg", ".md", ".less"}

    for project_id in config["projects"]:
        project_root = ROOT_DIR / f"_{project_id}_"
        copied_files = 0

        for segment in ("core", "l1", "l2", "l5"):
            segment_dir = project_root / segment
            if not segment_dir.exists():
                continue

            for file_path in segment_dir.rglob("*"):
                if not file_path.is_file():
                    continue
                if file_path.suffix not in resource_suffixes:
                    continue
                if file_path.name == ".tailwind.workspace.css":
                    continue
                if file_path.name == "tailwind.css":
                    continue

                target_file = LOCAL_DIST_DIR / file_path.relative_to(ROOT_DIR)
                target_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file_path, target_file)
                copied_files += 1

        if copied_files > 0:
            log(f"Copied project resources for project {project_id} (files={copied_files})")


def build_frontend_publication_targets(config: dict) -> None:
    targets = get_publication_targets(config)
    for target_name in targets:
        run(["node", "scripts/build_frontend.mjs", "--target", target_name])
        copy_frontend_publication_resources(config, target_name)
        render_publication_shell_templates(config, target_name, targets[target_name])
        log(f"Publication target built ({target_name})")


def copy_frontend_publication_resources(config: dict, target_name: str) -> None:
    resource_suffixes = {".html", ".json", ".svg", ".css", ".md", ".less"}
    target_root = DIST_DIR / target_name

    for project_id, project in config["projects"].items():
        l2_dir = ROOT_DIR / f"_{project_id}_" / "l2"
        if not l2_dir.exists():
            continue

        copied_files = 0

        for assets_dir in l2_dir.rglob("assets"):
            if not assets_dir.is_dir():
                continue
            target_dir = target_root / assets_dir.relative_to(ROOT_DIR)
            shutil.copytree(assets_dir, target_dir, dirs_exist_ok=True)

        for file_path in l2_dir.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix not in resource_suffixes:
                continue
            if file_path.name == ".tailwind.workspace.css":
                continue
            if file_path.name == "tailwind.css":
                continue

            target_file = target_root / file_path.relative_to(ROOT_DIR)
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, target_file)
            copied_files += 1

        if project["type"] == "master frontend":
            built_tailwind = LOCAL_DIST_DIR / f"_{project_id}_" / "l2" / "shared" / "tailwind.css"
            if built_tailwind.exists():
                target_tailwind = target_root / f"_{project_id}_" / "l2" / "shared" / "tailwind.css"
                if target_tailwind.resolve() == built_tailwind.resolve():
                    continue
                target_tailwind.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(built_tailwind, target_tailwind)
                copied_files += 1

        if copied_files > 0:
            log(f"Copied publication resources for target={target_name} project={project_id} (files={copied_files})")


def prefix_project_asset_urls(contents: str, asset_base_url: str) -> str:
    if not asset_base_url:
        return contents

    normalized_base = asset_base_url.rstrip("/")

    def replace(match: re.Match[str]) -> str:
        return f"{match.group('prefix')}{normalized_base}{match.group('path')}"

    return PROJECT_ASSET_URL_PATTERN.sub(replace, contents)


def render_publication_shell_templates(config: dict, target_name: str, target_config: dict) -> None:
    asset_base_url = str(target_config.get("assetBaseUrl", "") or "")
    for shell_relative_path in config.get("shellTemplates", {}).values():
        source_path = ROOT_DIR / shell_relative_path.replace("./", "", 1)
        if not source_path.exists():
            continue

        rendered = source_path.read_text(encoding="utf-8")
        rendered = IMPORTMAP_PATTERN.sub("", rendered)
        rendered = prefix_project_asset_urls(rendered, asset_base_url)

        target_path = DIST_DIR / target_name / source_path.relative_to(ROOT_DIR)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(rendered, encoding="utf-8")


def run_full_build(config: dict) -> None:
    clean_dist()
    build_typescript(config)
    build_tailwind(config)
    rewrite_absolute_imports(config)
    rewrite_dist_project_absolute_imports()
    copy_project_sql(config)
    copy_frontend_static_files(config)
    copy_project_resources(config)
    build_frontend_publication_targets(config)
    log("Workspace build finished successfully")


def watch_typescript(config: dict) -> None:
    log("Entering TypeScript watch mode. Static copy and post-build steps will not rerun automatically.")
    dynamic_tsconfig = build_dynamic_tsconfig(config)
    with tempfile.NamedTemporaryFile("w", suffix=".json", dir=ROOT_DIR, delete=False, encoding="utf-8") as temp_file:
        json.dump(dynamic_tsconfig, temp_file, indent=2)
        temp_file.write("\n")
        temp_path = Path(temp_file.name)
    try:
        subprocess.run(["npx", "tsc", "-p", relative_to_root(temp_path), "--watch"], cwd=ROOT_DIR, check=True)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Collab workspace")
    parser.add_argument(
        "--watch-tsc",
        action="store_true",
        help="Run one full build, then keep TypeScript compiler in watch mode.",
    )
    args = parser.parse_args()

    config = load_config()
    run_full_build(config)

    if args.watch_tsc:
        watch_typescript(config)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        log(f"Command failed with exit code {error.returncode}")
        raise
    except Exception as error:  # noqa: BLE001
        log(f"Build aborted: {error}")
        raise
