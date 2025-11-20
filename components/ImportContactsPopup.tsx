'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { collection, getDocs, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ContactField } from '@/types/contact';
import { FieldMapping, MappingResult, ImportStats, ParsedContact } from '@/types/import';

interface ImportContactsPopupProps {
  onClose: () => void;
  onComplete: () => void;
}

export default function ImportContactsPopup({ onClose, onComplete }: ImportContactsPopupProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Step 1: File upload
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedContact[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  // Step 2: Mapping
  const [mappingResult, setMappingResult] = useState<MappingResult | null>(null);
  const [contactFields, setContactFields] = useState<ContactField[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  
  // Step 3: Import
  const [importStats, setImportStats] = useState<ImportStats>({
    total: 0,
    created: 0,
    merged: 0,
    errors: 0
  });
  const [importing, setImporting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setLoading(true);
    setLoadingMessage('Analyzing file and detecting columns...');

    try {
      // Parse file
      const fileData = await parseFile(selectedFile);
      setParsedData(fileData);
      
      if (fileData.length === 0) {
        throw new Error('No data found in file');
      }

      const fileHeaders = Object.keys(fileData[0]);
      setHeaders(fileHeaders);

      // Fetch contact fields from Firestore
      const fieldsSnapshot = await getDocs(collection(db, 'contactFields'));
      const fields = fieldsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ContactField[];
      setContactFields(fields);

      // Get AI mapping suggestions
      setLoadingMessage('Mapping columns with AI...');
      const systemPrompt = await buildSystemPrompt(fields);
      
      const response = await fetch('/api/map-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: fileHeaders, systemPrompt })
      });

      if (!response.ok) {
        throw new Error('Failed to get mapping suggestions');
      }

      const mapping = await response.json();
      setMappingResult(mapping);
      
      setStep(2);
    } catch (err) {
      console.error('Error processing file:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const parseFile = async (file: File): Promise<ParsedContact[]> => {
    return new Promise((resolve, reject) => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            resolve(results.data as ParsedContact[]);
          },
          error: (error) => {
            reject(error);
          }
        });
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            resolve(jsonData as ParsedContact[]);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsBinaryString(file);
      } else {
        reject(new Error('Unsupported file type. Please upload CSV or Excel file.'));
      }
    });
  };

  const buildSystemPrompt = async (customFields: ContactField[]): Promise<string> => {
    let prompt = `You are a Smart Field Mapping Engine for a Contact Importer system.

Your job:
Given the user-uploaded file's column headers, sample values, and the company's data model
(core fields + custom fields), you must output the best possible mapping between:
- file headers  → system fields

You MUST always respond only in the JSON format defined below.
Do NOT add commentary, explanations, or any text outside the JSON.

----------------------------------------------------
### SYSTEM DATA MODEL
The system has these data models:

1. Core Contact Fields:
- firstName  (text)
- lastName   (text)
- phone      (phone)
- email      (email)
- agentUid   (email)

2. Custom Contact Fields:\n`;

    if (customFields.length > 0) {
      customFields.forEach(field => {
        prompt += `- ${field.label} (${field.type}, customFieldId: ${field.id})\n`;
      });
    } else {
      prompt += `(None defined yet)\n`;
    }

    prompt += `
Note: Common contact-related fields like "address", "country", "city", "state", "zipCode", "company", "jobTitle", etc. may exist as custom fields in the system. These should be mapped to their corresponding custom field IDs if they match by label similarity, even though they are not core fields.

----------------------------------------------------
### HOW YOU SHOULD MAP
You must evaluate mapping based on:
1. Header similarity (lowercase, remove spaces, underscores, punctuation)
2. Semantic meaning (e.g., "mobile", "contact no" → phone)
3. Core field matching (firstName, lastName, email, phone, agentUid)
4. Custom field matching using label similarity
5. If the header is not understandable OR is understandable but not related to contacts, return "unmapped"

----------------------------------------------------
### RULES
- Each header can map to **0 or 1 system fields**.
- Map to "unmapped" if:
  - The header is not understandable, OR
  - The header is understandable but not related to contacts (e.g., "orderId", "transactionDate", "productName")
- Provide a "confidence" score between 0 and 1.

Examples:
- High confidence (~0.9–1.0): clear semantic match or clear data pattern
- Medium (~0.5–0.8): partial header match OR partial data match
- Low (<0.5): return unmapped

Important: Fields like "address", "country", "city", "state", "zipCode", "company", "jobTitle" are contact-related and should be mapped to custom fields (using their custom field ID) if they match by label similarity, not marked as "unmapped".

----------------------------------------------------
### JSON OUTPUT FORMAT
Respond ONLY in this format:

{
  "mapping": {
    "Header1": {
      "mappedTo": "firstName" | "lastName" | "email" | "phone" | "agentUid" | "<customFieldId>" | "unmapped",
      "confidence": 0.0
    },
    "Header2": {
      "mappedTo": "...",
      "confidence": 0.0
    }
  },
  "unmappedHeaders": ["..."],
  "notes": "Short explanation of your reasoning"
}

Notes must be short (2–3 lines) and helpful for developers.

----------------------------------------------------

Your role:
- Think step-by-step.
- Be strict with the JSON format.
- Be consistent.
- Use deterministic logic + semantic reasoning.
- Remember: "unmapped" means either not understandable OR understandable but not related to contacts.
- Contact-related fields (even if not core fields) should be mapped to custom fields, not marked as "unmapped".`;

    return prompt;
  };

  const getFieldLabel = (mappedTo: string): string => {
    const coreFields: Record<string, string> = {
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      agentUid: 'Assigned Agent'
    };

    if (coreFields[mappedTo]) {
      return coreFields[mappedTo];
    }

    const customField = contactFields.find(f => f.id === mappedTo);
    return customField ? customField.label : mappedTo;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-blue-100 text-blue-800';
    if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    if (confidence >= 0.5) return 'Low';
    return 'Very Low';
  };

  const handleUpdateMapping = (header: string, newMappedTo: string) => {
    if (!mappingResult) return;

    const updatedMapping = { ...mappingResult.mapping };
    updatedMapping[header] = {
      ...updatedMapping[header],
      mappedTo: newMappedTo
    };

    setMappingResult({
      ...mappingResult,
      mapping: updatedMapping,
      unmappedHeaders: Object.keys(updatedMapping).filter(
        h => updatedMapping[h].mappedTo === 'unmapped'
      )
    });
    setEditingField(null);
  };

  const handleImport = async () => {
    if (!mappingResult || parsedData.length === 0) return;

    setStep(3);
    setImporting(true);
    setLoadingMessage('Processing contacts...');

    const stats: ImportStats = {
      total: parsedData.length,
      created: 0,
      merged: 0,
      errors: 0
    };

    try {
      // Fetch all users for agent mapping
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersByEmail = new Map(
        usersSnapshot.docs.map(doc => [doc.data().email, doc.id])
      );

      // Process contacts in batches
      const batchSize = 100;
      for (let i = 0; i < parsedData.length; i += batchSize) {
        const batch = parsedData.slice(i, i + batchSize);
        
        for (const row of batch) {
          try {
            const mappedContact = mapRowToContact(row, mappingResult, usersByEmail);
            
            // Validate core fields
            if (!mappedContact.email && !mappedContact.phone) {
              stats.errors++;
              continue;
            }

            // Check for existing contact (deduplication)
            const existing = await findExistingContact(mappedContact);
            
            if (existing) {
              // Merge/update existing contact
              await updateDoc(doc(db, 'contacts', existing.id), mappedContact);
              stats.merged++;
            } else {
              // Create new contact
              await addDoc(collection(db, 'contacts'), mappedContact);
              stats.created++;
            }
          } catch (error) {
            console.error('Error processing contact:', error);
            stats.errors++;
          }
        }

        setLoadingMessage(`Processing ${Math.min(i + batchSize, parsedData.length)} of ${parsedData.length} contacts...`);
      }

      setImportStats(stats);
      setImporting(false);
      setLoadingMessage('');
    } catch (error) {
      console.error('Error importing contacts:', error);
      setError(error instanceof Error ? error.message : 'Failed to import contacts');
      setImporting(false);
      setLoadingMessage('');
    }
  };

  const mapRowToContact = (
    row: ParsedContact,
    mapping: MappingResult,
    usersByEmail: Map<string, string>
  ): any => {
    const contact: any = {};

    for (const [header, value] of Object.entries(row)) {
      const fieldMapping = mapping.mapping[header];
      if (!fieldMapping || fieldMapping.mappedTo === 'unmapped' || !value) continue;

      const mappedTo = fieldMapping.mappedTo;

      if (mappedTo === 'agentUid') {
        // Map agent email to agentUid
        const agentId = usersByEmail.get(value as string);
        if (agentId) {
          contact.agentUid = agentId;
        }
      } else {
        contact[mappedTo] = value;
      }
    }

    return contact;
  };

  const findExistingContact = async (contact: any): Promise<any | null> => {
    try {
      // First try to find by email
      if (contact.email) {
        const emailQuery = query(
          collection(db, 'contacts'),
          where('email', '==', contact.email)
        );
        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
          return { id: emailSnapshot.docs[0].id, ...emailSnapshot.docs[0].data() };
        }
      }

      // Then try to find by phone
      if (contact.phone) {
        const phoneQuery = query(
          collection(db, 'contacts'),
          where('phone', '==', contact.phone)
        );
        const phoneSnapshot = await getDocs(phoneQuery);
        if (!phoneSnapshot.empty) {
          return { id: phoneSnapshot.docs[0].id, ...phoneSnapshot.docs[0].data() };
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding existing contact:', error);
      return null;
    }
  };

  const handleFinish = () => {
    onComplete();
    onClose();
  };

  const getSampleValues = (header: string): string[] => {
    return parsedData
      .slice(0, 3)
      .map(row => row[header])
      .filter(val => val);
  };

  const mappedFieldsCount = mappingResult
    ? Object.values(mappingResult.mapping).filter(m => m.mappedTo !== 'unmapped').length
    : 0;

  const highConfidenceCount = mappingResult
    ? Object.values(mappingResult.mapping).filter(m => m.confidence >= 0.7 && m.mappedTo !== 'unmapped').length
    : 0;

  const customFieldsCount = mappingResult
    ? Object.values(mappingResult.mapping).filter(m => 
        m.mappedTo !== 'unmapped' && 
        !['firstName', 'lastName', 'email', 'phone', 'agentUid'].includes(m.mappedTo)
      ).length
    : 0;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import Contacts</h2>
              <p className="text-sm text-gray-500">Step {step} of 3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${
                step >= 1 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step > 1 ? '✓' : '1'}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Detect Fields</div>
                <div className="text-xs text-gray-500">Review data structure</div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-300 flex-1 mx-4" />

            {/* Step 2 */}
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${
                step >= 2 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step > 2 ? '✓' : '2'}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Map Fields</div>
                <div className="text-xs text-gray-500">Connect to CRM Fields</div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-300 flex-1 mx-4" />

            {/* Step 3 */}
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${
                step >= 3 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                3
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Final Checks</div>
                <div className="text-xs text-gray-500">For Duplicates or Errors</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Step 1: File Upload & Detection */}
          {step === 1 && (
            <div className="space-y-6">
              {!loading && !file && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload File</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Upload a CSV or Excel file with your contacts. We'll automatically detect and map the fields.
                  </p>
                  
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg 
                      className="mx-auto h-12 w-12 text-gray-400 mb-4" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                      />
                    </svg>
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">CSV or Excel files supported</p>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-24 h-24 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-12 h-12 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-blue-600 mb-2">
                    {step === 1 ? 'Auto Detecting Field Mapping...' : loadingMessage}
                  </h3>
                  <p className="text-sm text-gray-500 text-center max-w-md">
                    {step === 1 
                      ? `Analyzing ${headers.length} columns and matching with CRM fields using AI...`
                      : 'Matching spreadsheets columns to CRM fields using intelligent pattern recognition...'
                    }
                  </p>
                  <div className="w-64 h-2 bg-gray-200 rounded-full mt-6 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-progress" style={{ width: '60%' }} />
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Mapping Review */}
          {step === 2 && mappingResult && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Column Detection Results</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Our intelligent mapping has mapped {mappedFieldsCount} fields in this entry with the CRM Contact Fields
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-green-800">{mappedFieldsCount} Fields Detected</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                      <span className="text-sm font-medium text-purple-800">{highConfidenceCount} High Confidence</span>
                    </div>
                  </div>

                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      <span className="text-sm font-medium text-pink-800">{customFieldsCount} Custom Fields</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mapping List */}
              <div className="space-y-3">
                {Object.entries(mappingResult.mapping).map(([header, mapping]) => (
                  <div 
                    key={header}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Confidence Badge */}
                        <div className={`px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(mapping.confidence)}`}>
                          {Math.round(mapping.confidence * 100)}% · {getConfidenceLabel(mapping.confidence)}
                        </div>

                        {/* Database Field */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded">
                              DATABASE FIELD
                            </span>
                            <span className="font-medium text-gray-900">{header}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <span>Sample:</span>
                            {getSampleValues(header).map((val, idx) => (
                              <span key={idx} className="bg-gray-100 px-2 py-1 rounded">{val}</span>
                            ))}
                          </div>
                        </div>

                        {/* Arrow */}
                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>

                        {/* CRM Field */}
                        <div className="flex-1">
                          {editingField === header ? (
                            <select
                              value={mapping.mappedTo}
                              onChange={(e) => handleUpdateMapping(header, e.target.value)}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="w-full px-3 py-2 border border-blue-500 rounded-md text-sm"
                            >
                              <option value="unmapped">-- Unmapped --</option>
                              <optgroup label="Core Fields">
                                <option value="firstName">First Name</option>
                                <option value="lastName">Last Name</option>
                                <option value="email">Email</option>
                                <option value="phone">Phone</option>
                                <option value="agentUid">Assigned Agent</option>
                              </optgroup>
                              {contactFields.length > 0 && (
                                <optgroup label="Custom Fields">
                                  {contactFields.map(field => (
                                    <option key={field.id} value={field.id}>{field.label}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                CRM FIELD
                              </span>
                              <span className="font-medium text-blue-600">
                                {mapping.mappedTo === 'unmapped' ? '(Unmapped)' : getFieldLabel(mapping.mappedTo)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingField(header)}
                          className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Final Checks & Import */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-12">
              {importing ? (
                <>
                  <div className="w-24 h-24 bg-teal-50 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-12 h-12 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-blue-600 mb-2">Running Final Checks...</h3>
                  <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                    {loadingMessage || 'Scanning entries for duplicates, missing details, or errors before the import completes...'}
                  </p>
                  <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-progress" style={{ width: '80%' }} />
                  </div>
                </>
              ) : (
                <>
                  <div className="w-24 h-24 bg-teal-50 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-12 h-12 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Import Complete!</h3>
                  <p className="text-sm text-gray-500 text-center max-w-md mb-8">
                    Your contacts have been successfully imported.
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                      <div className="text-sm text-green-800 mb-2">Total Contacts Imported</div>
                      <div className="text-4xl font-bold text-green-600">{importStats.created}</div>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
                      <div className="text-sm text-orange-800 mb-2">Contacts Merged</div>
                      <div className="text-4xl font-bold text-orange-600">{importStats.merged}</div>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                      <div className="text-sm text-red-800 mb-2">Errors</div>
                      <div className="text-4xl font-bold text-red-600">{importStats.errors}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>

          <div className="flex gap-3">
            {step > 1 && step < 3 && (
              <button
                onClick={() => setStep((step - 1) as 1 | 2)}
                className="px-6 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50"
              >
                ← Previous
              </button>
            )}
            
            {step === 2 && (
              <button
                onClick={handleImport}
                className="px-6 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700"
              >
                Next →
              </button>
            )}

            {step === 3 && !importing && (
              <button
                onClick={handleFinish}
                className="px-6 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700"
              >
                Go to Contacts
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

