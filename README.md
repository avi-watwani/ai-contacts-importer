# 🚀 Smart Contacts Importer

An AI-powered contact management system with intelligent field mapping using **Gemini 2.5 Pro**.

## ✨ Features

### 📊 **Contacts Dashboard**
- View all contacts in a dynamic, responsive table
- Auto-detects and displays contact fields
- Real-time data from Firestore
- Import and manage users from a single interface

### 👥 **User Management**
- Full CRUD operations for users/agents
- Clean, intuitive interface
- User ID, name, and email display
- Modal-based add/edit forms

### 🤖 **AI-Powered Import** (Main Feature)
**Multi-step wizard with intelligent field mapping:**

1. **File Upload & Detection**
   - Upload CSV or Excel files
   - Auto-parse and extract columns
   - Smart file validation

2. **AI Field Mapping**
   - Powered by Gemini 2.5 Pro contacts field mapping
   - Confidence scoring for each mapping
   - Manual editing capabilities
   - Maps to core and custom fields
   - Sample data preview

3. **Smart Import**
   - Automatic deduplication (by email/phone)
   - Batch processing (100 records at a time)
   - Agent email → agentUid mapping
   - Real-time progress tracking
   - Detailed summary (created, merged, errors)

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** Firebase Firestore
- **AI:** Google Gemini 2.5 Pro
- **Styling:** Tailwind CSS
- **File Parsing:** 
  - PapaParse (CSV)
  - XLSX (Excel)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- Firebase project
- Google Gemini API key

### Installation

1. **Clone and install:**
```bash
npm install
```

2. **Environment Setup:**

Create `.env.local` file:
```env
# Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

3. **Firebase Setup:**

Create these Firestore collections:
- `contacts` - Stores contact records
- `contactFields` - Custom field definitions
- `users` - Agent/user records

4. **Run Development Server:**
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
ai-contacts-importer/
├── app/
│   ├── api/
│   │   └── map-fields/      # AI mapping API endpoint
│   ├── users/                # Users page
│   ├── layout.tsx
│   └── page.tsx              # Homepage
├── components/
│   ├── ContactsPage.tsx      # Main contacts dashboard
│   ├── UsersPage.tsx         # User management
│   └── ImportContactsPopup.tsx  # AI import wizard
├── lib/
│   ├── firebase.ts           # Firebase config
│   └── gemini.ts             # Gemini AI integration
├── types/
│   ├── contact.ts            # Contact types
└── └── import.ts             # Import types
```

## 📖 Usage

### Importing Contacts

1. Click **"Import Contacts"** button
2. Upload CSV or Excel file
3. Review AI-generated field mappings
4. Adjust mappings if needed
5. Click **"Next"** to import
6. View summary and close

### Sample CSV Format

```csv
customer_name,contact_email,mobile_number,agent_assigned
John Smith,john@example.com,+1-555-0101,agent@company.com
```

### Managing Users

- Navigate to **"Manage Users"**
- Add, edit, or delete users
- Users can be assigned to contacts

## 🤖 AI Mapping Details

### How It Works

1. Extracts headers from uploaded file
2. Fetches existing ContactFields from Firestore
3. Builds dynamic system prompt with:
   - Core fields (firstName, lastName, email, phone, agentUid)
   - Custom fields from database
4. Sends to Gemini 2.5 Pro for intelligent mapping
5. Returns confidence scores (0.0 - 1.0)

### Confidence Levels

- **High (0.9-1.0):** Clear semantic match
- **Medium (0.7-0.9):** Partial match
- **Low (0.5-0.7):** Uncertain
- **Unmapped (<0.5):** Not contact-related

## 🔄 Deduplication Logic

1. Check if contact exists by **email**
2. If no match, check by **phone**
3. If match found → **Merge** (update with new data)
4. If no match → **Create** new contact

## 📊 Firestore Collections

### `contacts`
```typescript
{
  email?: string,
  phone?: string,
  firstName?: string,
  lastName?: string,
  agentUid?: string,
  [customFieldId]: any
}
```

### `contactFields`
```typescript
{
  label: string,
  type: 'text' | 'number' | 'phone' | 'email' | 'datetime',
  core: boolean
}
```

### `users`
```typescript
{
  name: string,
  email: string
}
```

## 🐛 Troubleshooting

### Common Issues

1. **AI Mapping Failed:**
   - Verify `GEMINI_API_KEY` in `.env.local`
   - Check API quota

2. **Import Errors:**
   - Ensure email OR phone exists in each row
   - Verify file format (CSV, XLSX, XLS)

3. **Firebase Permission Denied:**
   - Update Firestore security rules
   - For testing: Allow all reads/writes

## 📦 Dependencies

```json
{
  "firebase": "^11.x",
  "papaparse": "^5.x",
  "xlsx": "^0.18.x",
  "@google/generative-ai": "^0.21.x"
}
```

## 🎯 Key Features Explained

### 1. Batch Processing
- Processes 100 contacts per batch
- Prevents Firestore rate limit issues
- Real-time progress updates

### 2. Agent Mapping
- Automatically maps agent emails to user IDs
- Only valid users are linked
- Invalid emails are skipped

### 3. Smart Field Detection
- Core field recognition
- Custom field matching by label similarity
- Unmapped field handling

---

Built with ❤️ using Next.js, Firebase, and Gemini AI
