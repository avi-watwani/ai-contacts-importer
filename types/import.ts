export interface FieldMapping {
  mappedTo: string;
  confidence: number;
}

export interface MappingResult {
  mapping: Record<string, FieldMapping>;
  unmappedHeaders: string[];
  notes: string;
}

export interface ImportStats {
  total: number;
  created: number;
  merged: number;
  errors: number;
}

export interface ParsedContact {
  [key: string]: any;
}
