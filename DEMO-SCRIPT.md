# 🎬 **Stacy AI Safety Companion - Demo Script for Judges**

## 🎯 **3-Minute Demo Path**

---

### **📱 Step 1: Swift App Panic Button (30 seconds)**

**Judge Action:**

1. Open Swift app on iPhone
2. Press red "PANIC ALERT" button
3. Allow location access when prompted

**What Happens:**

- ✅ Immediate SMS sent to emergency contact: `+15146605707`
- ✅ Message includes GPS location and timestamp
- ✅ Shows "Alert sent successfully" in app

**Judge Sees:**

- SMS received on demo phone with location link
- Professional emergency alert format
- Instant response (< 3 seconds)

---

### **📞 Step 2: VAPI Voice Call (90 seconds)**

**Judge Action:**

1. Go to web interface: `https://stacy-demo.vercel.app`
2. Enter phone number: `+15146605707` (or judge's number)
3. Click "📞 Call Stacy (VAPI)"
4. Answer call from `+16693292501`

**Conversation Script:**

```
Stacy: "This is Stacy, your AI safety companion. What's your situation?"
Judge: "Someone is following me and I'm scared"
Stacy: "I understand. Are you in immediate danger right now?"
Judge: "Yes, I think so"
Stacy: "Can you speak safely or do you need discrete help?"
Judge: "I can speak"
Stacy: "I'm documenting this. Do you want me to alert your emergency contact?"
Judge: "Yes, send help"
```

**What Happens:**

- ✅ Professional dispatcher-style conversation
- ✅ Risk level escalates: SAFE → ELEVATED → CRITICAL
- ✅ Case file built in real-time
- ✅ Emergency SMS sent automatically

---

### **🚨 Step 3: Emergency Tools Demo (45 seconds)**

**During the call:**

**Stacy:** "I've sent an emergency alert to your contact. Would you like me to find nearby safe locations?"

**Judge:** "Yes, where can I go?"

**What Happens:**

- ✅ Stacy finds nearest police station, hospital, cafe
- ✅ Provides specific addresses and distances
- ✅ Offers to send location via SMS

**Stacy:** "The nearest police station is 0.5km away at 123 Main St. Should I call emergency services for you?"

**Judge:** "Yes, call them"

**What Happens:**

- ✅ Demo emergency call placed (calls your number, not real 911)
- ✅ Professional briefing script played
- ✅ Shows how Stacy would brief real emergency services

---

### **📋 Step 4: Case File Documentation (30 seconds)**

**Show on screen:**

- ✅ Complete case file generated
- ✅ Timeline of events with timestamps
- ✅ Risk level progression (SAFE → ELEVATED → CRITICAL)
- ✅ Evidence collected (location, threat description)
- ✅ Actions taken (SMS sent, emergency call placed)
- ✅ Professional format ready for law enforcement

---

### **🏥 Step 5: Safe Location Integration (15 seconds)**

**Show on map:**

- ✅ Google Maps opens with safe locations marked
- ✅ Police stations, hospitals, 24/7 establishments
- ✅ Distance and directions provided
- ✅ Real-time location tracking

---

## 🎤 **Judge Talking Points**

### **"What makes Stacy revolutionary?"**

1. **Professional Dispatcher AI**: Trained like a 911 operator with strict protocols
2. **Real Emergency Actions**: Actually sends SMS, makes calls, builds case files
3. **Dual-Mode Communication**: Voice calls AND mobile app integration
4. **Evidence Building**: Creates professional documentation for law enforcement
5. **Swift Integration**: Native iOS app with instant emergency features

### **"How is this different from other safety apps?"**

- **Most safety apps**: Just send location or call 911
- **Stacy**: AI dispatcher that builds complete case files and briefs emergency services
- **Most apps**: User has to explain situation to 911
- **Stacy**: Emergency services get full briefing before user even speaks
- **Most apps**: Basic panic button
- **Stacy**: Professional emergency response system with evidence collection

### **"What's the technical innovation?"**

- **VAPI Integration**: Professional voice AI that can make real phone calls
- **Hybrid Architecture**: WebRTC for real-time + VAPI for mobile integration
- **Emergency Tool Suite**: 5 real-world tools that take actual actions
- **Risk Assessment Engine**: Real-time analysis with keyword detection
- **Cross-Platform**: Web, iOS, and voice all integrated seamlessly

---

## 📞 **Demo Phone Numbers**

- **Stacy's Number (Calls FROM)**: `+16693292501`
- **Demo Target (Calls TO)**: `+15146605707`
- **Emergency Contact**: `+15146605707` (same for demo)

---

## 🚀 **Quick Setup for Demo**

### **1. Deploy to Vercel:**

```bash
vercel --prod
```

### **2. Configure VAPI Webhook:**

- Go to VAPI Dashboard
- Update webhook URL: `https://your-domain.vercel.app/api/vapi/webhook-production`

### **3. Test Before Demo:**

```bash
# Test API health
curl https://your-domain.vercel.app/api/swift/stacy-mobile

# Test emergency call
curl -X POST https://your-domain.vercel.app/api/swift/stacy-mobile \
  -H "Content-Type: application/json" \
  -d '{"action":"emergency_call","data":{"userPhone":"+15146605707"}}'
```

---

## 🏆 **Success Metrics for Judges**

1. **⚡ Speed**: Panic button → SMS delivered in < 3 seconds
2. **📞 Voice Quality**: Clear, professional dispatcher conversation
3. **🛠️ Real Actions**: Actual SMS sent, real phone calls made
4. **📋 Documentation**: Professional case file with evidence
5. **📱 Mobile Integration**: Swift app seamlessly integrated

**This isn't just a demo - it's a working emergency response system that could save lives.** 🛡️🚨✨
