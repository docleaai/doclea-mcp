/**
 * SCIP (Sourcegraph Code Intelligence Protocol) types
 * These types represent the parsed output from SCIP indexers
 */

export interface ScipIndex {
  metadata: ScipMetadata;
  documents: ScipDocument[];
  externalSymbols: ScipSymbolInfo[];
}

export interface ScipMetadata {
  projectRoot: string;
  toolName: string;
  toolVersion: string;
}

export interface ScipDocument {
  relativePath: string;
  language: string;
  symbols: ScipSymbolInfo[];
  occurrences: ScipOccurrence[];
}

export interface ScipSymbolInfo {
  symbol: string;
  documentation: string[];
  kind: ScipSymbolKind;
  displayName: string;
  signatureDocumentation?: string;
  enclosingSymbol?: string;
  relationships: ScipRelationship[];
}

export interface ScipOccurrence {
  symbol: string;
  range: [number, number, number, number]; // startLine, startCol, endLine, endCol
  enclosingRange?: [number, number, number, number];
  symbolRoles: number;
  isDefinition: boolean;
}

export interface ScipRelationship {
  symbol: string;
  isReference: boolean;
  isImplementation: boolean;
  isTypeDefinition: boolean;
  isDefinition: boolean;
}

/**
 * SCIP Symbol Kind enum values from the protobuf definition
 */
export enum ScipSymbolKind {
  UnspecifiedKind = 0,
  AbstractMethod = 66,
  Accessor = 72,
  Array = 1,
  Assertion = 2,
  AssociatedType = 3,
  Attribute = 4,
  Axiom = 5,
  Boolean = 6,
  Class = 7,
  Constant = 8,
  Constructor = 9,
  Contract = 62,
  DataFamily = 10,
  Delegate = 73,
  Enum = 11,
  EnumMember = 12,
  Error = 63,
  Event = 13,
  Fact = 14,
  Field = 15,
  File = 16,
  Function = 17,
  Getter = 18,
  Grammar = 19,
  Instance = 20,
  Interface = 21,
  Key = 22,
  Lang = 23,
  Lemma = 24,
  Library = 64,
  Macro = 25,
  Method = 26,
  MethodAlias = 74,
  MethodReceiver = 27,
  MethodSpecification = 67,
  Message = 28,
  Modifier = 65,
  Module = 29,
  Namespace = 30,
  Null = 31,
  Number = 32,
  Object = 33,
  Operator = 34,
  Package = 35,
  PackageObject = 36,
  Parameter = 37,
  ParameterLabel = 38,
  Pattern = 39,
  Predicate = 40,
  Property = 41,
  Protocol = 42,
  ProtocolMethod = 68,
  PureVirtualMethod = 69,
  Quasiquoter = 43,
  SelfParameter = 44,
  Setter = 45,
  Signature = 46,
  SingletonClass = 75,
  SingletonMethod = 76,
  StaticDataMember = 77,
  StaticEvent = 78,
  StaticField = 79,
  StaticMethod = 80,
  StaticProperty = 81,
  StaticVariable = 82,
  String = 48,
  Struct = 49,
  Subscript = 47,
  Tactic = 50,
  Theorem = 51,
  ThisParameter = 52,
  Trait = 53,
  TraitMethod = 70,
  Type = 54,
  TypeAlias = 55,
  TypeClass = 56,
  TypeClassMethod = 71,
  TypeFamily = 57,
  TypeParameter = 58,
  Union = 59,
  Value = 60,
  Variable = 61,
}

/**
 * SCIP Symbol Role bitmask values
 */
export enum ScipSymbolRole {
  UnspecifiedSymbolRole = 0,
  Definition = 1,
  Import = 2,
  WriteAccess = 4,
  ReadAccess = 8,
  Generated = 16,
  Test = 32,
  ForwardDefinition = 64,
}
