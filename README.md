# 🚨 Stacy AI Safety Companion - VAPI Integration

A revolutionary AI safety companion built with Next.js and VAPI that provides professional emergency response capabilities through voice calls, SMS alerts, and real-time safety assistance.

## 🚀 Stacy Features

### 🛡️ **Core Safety Capabilities**

- **Professional Dispatcher AI**: Trained with 911 operator protocols and strict emergency procedures
- **Voice Safety Calls**: AI companion calls users for immediate support during distress
- **Real Emergency Actions**: Sends actual SMS alerts, makes emergency calls, builds case files
- **Risk Assessment**: Analyzes distress levels (SAFE/ELEVATED/CRITICAL) with keyword detection
- **Location Services**: GPS tracking and safe location finding (police, hospitals, safe places)

### 📞 **Emergency Communication**

- **Comprehensive Emergency Reports**: Professional incident documentation sent to contacts
- **Demo Emergency Calls**: AI briefs emergency services before connecting user
- **SMS Integration**: Real Twilio text messages with location and case details
- **Quick Alert System**: Panic button functionality for immediate help
- **Stealth Mode**: Discrete emergency communication when user cannot speak

### 🧠 **AI Intelligence**

- **Context-Aware Responses**: Adapts communication based on safety state
- **Evidence Building**: Structured case file management for law enforcement
- **Professional Protocols**: One action per turn, dispatcher-style communication
- **Tool Integration**: 5 emergency tools with real-world actions

### 📱 **Mobile-Ready APIs**

- **Swift Frontend Integration**: Mobile-friendly endpoints for iOS app
- **Real-time Location**: GPS integration with accuracy monitoring
- **Battery Awareness**: Optimized for emergency situations
- **Offline Capabilities**: Works even with limited connectivity

## 📋 Prerequisites

1. **VAPI Account**: Sign up at [vapi.ai](https://vapi.ai)
2. **API Key**: Get your API key from the VAPI dashboard
3. **Assistant**: Create an assistant in your VAPI dashboard
4. **Phone Number**: Set up a phone number for outbound calls
5. **Node.js 18+**: Make sure you have Node.js installed

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# VAPI Configuration - Get these from your VAPI dashboard
VAPI_BACKEND_KEY=your_vapi_backend_key_here
VAPI_PHONE_NUMBER_ID=your_phone_number_id_here

# Twilio Configuration - Get these from your Twilio dashboard
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_NUMBER=+16693292501

# OpenAI Configuration (for Swift app)
OPENAI_API_KEY=your_openai_key_here
```

#### How to get your credentials:

1. **VAPI Keys**:

   - Go to [VAPI Dashboard](https://dashboard.vapi.ai)
   - Navigate to Settings → API Keys
   - Copy your Backend Key (for server-side API calls)
   - Copy your Frontend Key (for client-side integration)

2. **Twilio Configuration**:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Find your Account SID and Auth Token in the dashboard
   - Purchase a phone number or use an existing one
   - Copy the phone number in E.164 format (e.g., +1234567890)

### 3. Run the Development Server

```bash
npm run dev
```

The application will start at `http://localhost:3000`

## 🎯 Usage

### Making Outbound Calls

1. Open `http://localhost:3000` in your browser
2. In the "Make Outbound Call" section:
   - Enter the target phone number (include country code, e.g., +1234567890)
   - Optionally add a custom message
   - Click "Make Call"

### Creating Voice Assistants

1. In the "Create Assistant" section:
   - Enter a name for your assistant
   - Write a system prompt that defines how the assistant should behave
   - Click "Create Assistant"

Example system prompts:

- **Customer Service**: "You are a helpful customer service representative. Be polite, professional, and try to resolve customer issues."
- **Appointment Scheduler**: "You are an appointment scheduler. Help users book appointments and answer questions about availability."
- **Survey Conductor**: "You are conducting a brief customer satisfaction survey. Ask 3-5 questions and be conversational."

## 🔧 Stacy API Endpoints

### 🚨 **Core APIs**

- `POST /api/stacy/voice-call` - Initiate Stacy safety call with professional dispatcher AI
- `POST /api/stacy/emergency` - Emergency tool access (case files, SMS, calls)
- `POST /api/stacy/mobile` - Mobile-optimized emergency features
- `POST /api/vapi/webhook` - VAPI webhook handler for emergency tool execution
- `GET /api/status` - Configuration status

### Example API Usage

```javascript
// Make a call
const response = await fetch("/api/call", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    phone_number: "+1234567890",
    message: "Hello! This is a test call.",
  }),
});

const result = await response.json();
console.log(result);
```

## 🏗️ Project Structure

```
├── components/           # React components
│   └── StacyInterface.tsx # Main Stacy safety interface
├── lib/                 # Utility libraries
│   ├── vapi-client.ts   # VAPI API client
│   └── stacy-tools.ts   # Emergency response toolkit
├── pages/               # Next.js pages and API routes
│   ├── api/            # API routes
│   │   ├── stacy/      # Safety and emergency endpoints
│   │   ├── vapi/       # VAPI webhook handler
│   │   └── status.ts   # Configuration status
│   ├── index.tsx       # Main page
│   └── _app.tsx        # App wrapper
├── public/             # Static files
│   ├── index.html      # Static safety interface
│   ├── app-enhanced.js # Simplified client
│   └── styles.css      # Styling
├── Stacy/              # iOS Swift app
│   └── Stacy/          # Swift source code
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript config
```

## 🐛 Troubleshooting

### Common Issues:

1. **"VAPI API key not configured"**

   - Make sure your `.env.local` file has the correct `VAPI_API_KEY`
   - Restart the development server after updating environment variables

2. **"Assistant ID not configured"**

   - Set `VAPI_ASSISTANT_ID` in your `.env.local` file
   - Create an assistant in your VAPI dashboard first

3. **"Phone Number ID not configured"**

   - Set `VAPI_PHONE_NUMBER_ID` in your `.env.local` file
   - Purchase a phone number in your VAPI dashboard

4. **Call fails to connect**

   - Verify the target phone number format (+country_code + number)
   - Check your VAPI account balance
   - Ensure your assistant is properly configured

5. **Environment variables not loading**
   - Make sure the file is named `.env.local` (not `.env`)
   - Restart the development server after changes
   - Check that variables don't have quotes around values

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Other Platforms

Make sure to set the environment variables:

- `VAPI_API_KEY`
- `VAPI_ASSISTANT_ID`
- `VAPI_PHONE_NUMBER_ID`

## 📚 VAPI Resources

- [VAPI Documentation](https://docs.vapi.ai)
- [VAPI Dashboard](https://dashboard.vapi.ai)
- [VAPI API Reference](https://docs.vapi.ai/api-reference)

## 🔒 Security Notes

- Never commit your `.env.local` file with real API keys
- Use environment variables in production
- Implement rate limiting for production use
- Consider implementing authentication for the web interface
- VAPI API keys should only be used on the server side (in API routes)

## 📄 License

This project is open source and available under the MIT License.

---

**Happy Voice Agent Building! 🎉**

Need help? Check the VAPI documentation or create an issue in this repository.
