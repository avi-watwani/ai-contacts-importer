'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Contact, ContactField } from '@/types/contact';
import { useRouter } from 'next/navigation';
import ImportContactsPopup from './ImportContactsPopup';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactFields, setContactFields] = useState<ContactField[]>([]);
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch contacts
      const contactsSnapshot = await getDocs(collection(db, 'contacts'));
      const contactsData = contactsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      
      // Fetch contact fields
      const fieldsSnapshot = await getDocs(collection(db, 'contactFields'));
      const fieldsData = fieldsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ContactField[];
      
      // Fetch users for agent name mapping
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersMap = new Map<string, string>();
      usersSnapshot.docs.forEach(doc => {
        usersMap.set(doc.id, doc.data().name);
      });
      
      setContacts(contactsData);
      setContactFields(fieldsData);
      setUsers(usersMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const getFieldValue = (contact: Contact, fieldName: string) => {
    const value = contact[fieldName];
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    
    // Special handling for agentUid - display agent name instead of ID
    if (fieldName === 'agentUid' && typeof value === 'string') {
      const agentName = users.get(value);
      return agentName || '-';
    }
    
    // Handle Firestore references
    if (typeof value === 'object' && value.type === 'firestore/documentReference/1.0') {
      return value.referencePath || '-';
    }
    return String(value);
  };

  // Get all unique field names from contacts in consistent order
  const getAllFieldNames = () => {
    // Define core fields in desired order
    const coreFieldsOrder = ['firstName', 'lastName', 'email', 'phone', 'agentUid'];
    
    // Collect all unique field names
    const fieldSet = new Set<string>();
    contacts.forEach(contact => {
      Object.keys(contact).forEach(key => {
        if (key !== 'id') {
          fieldSet.add(key);
        }
      });
    });
    
    // Separate core fields and custom fields
    const allFields = Array.from(fieldSet);
    const coreFields = coreFieldsOrder.filter(field => allFields.includes(field));
    const customFields = allFields
      .filter(field => !coreFieldsOrder.includes(field))
      .sort(); // Sort custom fields alphabetically
    
    // Return core fields first, then custom fields
    return [...coreFields, ...customFields];
  };

  // Format field name for display
  const formatFieldName = (fieldName: string) => {
    // Check if it's a custom field ID
    const customField = contactFields.find(f => f.id === fieldName);
    if (customField) {
      return customField.label;
    }
    
    // Core field mapping
    const coreFieldLabels: Record<string, string> = {
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      agentUid: 'Agent Name'
    };
    
    if (coreFieldLabels[fieldName]) {
      return coreFieldLabels[fieldName];
    }
    
    // Convert camelCase to Title Case for any other fields
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  // Filter contacts based on search query
  const getFilteredContacts = () => {
    if (!searchQuery.trim()) {
      return contacts;
    }

    const query = searchQuery.toLowerCase();
    
    return contacts.filter(contact => {
      // Search by email
      if (contact.email && String(contact.email).toLowerCase().includes(query)) {
        return true;
      }
      
      // Search by phone
      if (contact.phone && String(contact.phone).toLowerCase().includes(query)) {
        return true;
      }
      
      // Search by agent name
      if (contact.agentUid) {
        const agentName = users.get(String(contact.agentUid));
        if (agentName && agentName.toLowerCase().includes(query)) {
          return true;
        }
      }
      
      return false;
    });
  };

  const filteredContacts = getFilteredContacts();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Smart Contacts Importer</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage and view all your contacts
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowImportPopup(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Import Contacts
              </button>
              <button
                onClick={() => router.push('/users')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Manage Users
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        {!loading && contacts.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email, phone, or agent name..."
                className="block text-black w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-2 text-sm text-gray-600">
                Found {filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading data</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No contacts</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by importing your first contacts.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowImportPopup(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Import Contacts
              </button>
            </div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No contacts found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search criteria
            </p>
            <div className="mt-6">
              <button
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {searchQuery ? `Found ${filteredContacts.length} Contacts` : `All Contacts (${contacts.length})`}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {getAllFieldNames().map((fieldName) => (
                      <th
                        key={fieldName}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {formatFieldName(fieldName)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                      {getAllFieldNames().map((fieldName) => (
                        <td
                          key={fieldName}
                          className="px-6 py-4 text-sm text-gray-900"
                        >
                          <div className="max-w-xs truncate" title={getFieldValue(contact, fieldName)}>
                            {getFieldValue(contact, fieldName)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Import Popup */}
      {showImportPopup && (
        <ImportContactsPopup
          onClose={() => setShowImportPopup(false)}
          onComplete={() => {
            fetchData();
            setShowImportPopup(false);
          }}
        />
      )}
    </div>
  );
}

