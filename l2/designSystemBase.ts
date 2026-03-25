/// <mls fileReference="_102029_/l2/designSystemBase.ts" enhancement="_blank" />

export interface IKeyValueToken {
  [key: string]: string;
}

export interface IDesignSystemTokens {
  themeName: string;
  description: string;
  color: IKeyValueToken;
  typography: IKeyValueToken;
  global: IKeyValueToken;
}

export interface IDesignSystem {
  tokens: IDesignSystemTokens[];
}
