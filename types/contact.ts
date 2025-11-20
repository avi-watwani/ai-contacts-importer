export interface Contact {
  id: string;
  [key: string]: any; // Dynamic fields based on ContactFields collection
}

export interface ContactField {
  id: string;
  label: string;
  type: string;
  core?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
}

