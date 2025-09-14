import SwiftUI

struct TestButtonsView: View {
    @ObservedObject var voiceVM: VoiceVM
    
    var body: some View {
        VStack(spacing: 16) {
            Text("🧪 Test Endpoints")
                .font(.headline)
                .foregroundColor(.blue)
            
            // Test Chat Endpoint
            Button(action: {
                Task {
                    await voiceVM.testChatEndpoint()
                }
            }) {
                HStack {
                    Image(systemName: "message")
                    Text("Test Chat")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.blue)
                .cornerRadius(8)
            }
            
            // Test Safe Places Search
            Button(action: {
                voiceVM.testSafePlacesSearch()
            }) {
                HStack {
                    Image(systemName: "location")
                    Text("Test Safe Places")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.green)
                .cornerRadius(8)
            }
            
            // Test Emergency Contact
            Button(action: {
                Task {
                    await voiceVM.testEmergencyContact()
                }
            }) {
                HStack {
                    Image(systemName: "exclamationmark.triangle")
                    Text("Test Emergency")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.red)
                .cornerRadius(8)
            }
            
            // Test SMS Action
            Button(action: {
                Task {
                    await voiceVM.testSMSAction()
                }
            }) {
                HStack {
                    Image(systemName: "message.fill")
                    Text("Test SMS")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.orange)
                .cornerRadius(8)
            }
            
            // Test Phone Call
            Button(action: {
                Task {
                    await voiceVM.testPhoneCall()
                }
            }) {
                HStack {
                    Image(systemName: "phone.fill")
                    Text("Test Call")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.purple)
                .cornerRadius(8)
            }
            
            // Clear Status
            Button(action: {
                voiceVM.clearTestStatus()
            }) {
                HStack {
                    Image(systemName: "trash")
                    Text("Clear Status")
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.gray)
                .cornerRadius(8)
            }
            
            // Show test results
            if !voiceVM.testStatus.isEmpty {
                ScrollView {
                    Text(voiceVM.testStatus)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding()
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(8)
                }
                .frame(maxHeight: 200)
            }
        }
        .padding()
    }
}

#Preview {
    TestButtonsView(voiceVM: VoiceVM())
}
