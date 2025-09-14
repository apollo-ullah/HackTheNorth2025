import SwiftUI
import OpenAIRealtime

struct ChatBotView: View {
    @StateObject private var chatManager = ChatBotManager()
    @State private var messageText = ""
    @State private var isTyping = false
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Premium gradient background
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.05, green: 0.1, blue: 0.25),
                        Color(red: 0.02, green: 0.06, blue: 0.23),
                        Color(red: 0.01, green: 0.03, blue: 0.15)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                // Subtle animated background pattern
                AnimatedBackgroundView()
                    .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Premium header
                    VStack(spacing: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 8) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 20, weight: .semibold))
                                        .foregroundColor(.green)
                                    
                                    Text("Stacy Chat")
                                        .font(.system(size: 28, weight: .bold, design: .rounded))
                                        .foregroundColor(.white)
                                }
                            }
                            
                            Spacer()
                            
                            Button(action: {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                    chatManager.clearChat()
                                }
                            }) {
                                Image(systemName: "trash")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.white.opacity(0.7))
                                    .padding(12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(Color.white.opacity(0.1))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 12)
                                                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                                            )
                                    )
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 20)
                    }
                    
                    // Messages area
                    ScrollViewReader { proxy in
                        ScrollView(showsIndicators: false) {
                            LazyVStack(spacing: 20) {
                                ForEach(chatManager.messages) { message in
                                    PremiumChatMessageView(message: message)
                                        .id(message.id)
                                        .transition(.asymmetric(
                                            insertion: .scale.combined(with: .opacity),
                                            removal: .scale.combined(with: .opacity)
                                        ))
                                }
                                
                                if isTyping {
                                    PremiumTypingIndicatorView()
                                        .id("typing")
                                        .transition(.asymmetric(
                                            insertion: .scale.combined(with: .opacity),
                                            removal: .scale.combined(with: .opacity)
                                        ))
                                }
                            }
                            .padding(.horizontal, 24)
                            .padding(.bottom, 20)
                        }
                        .onChange(of: chatManager.messages.count) { _ in
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                if let lastMessage = chatManager.messages.last {
                                    proxy.scrollTo(lastMessage.id, anchor: .bottom)
                                }
                            }
                        }
                    }
                    
                    // Premium input area
                    VStack(spacing: 0) {
                        // Subtle divider
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.clear,
                                        Color.white.opacity(0.1),
                                        Color.clear
                                    ]),
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: 1)
                        
                        HStack(spacing: 16) {
                            TextField("Type your message...", text: $messageText)
                                .textFieldStyle(PlainTextFieldStyle())
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                                .background(
                                    RoundedRectangle(cornerRadius: 24)
                                        .fill(Color.white.opacity(0.08))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 24)
                                                .stroke(Color.white.opacity(0.15), lineWidth: 1)
                                        )
                                )
                                .onSubmit {
                                    sendMessage()
                                }
                            
                            Button(action: sendMessage) {
                                ZStack {
                                    Circle()
                                        .fill(
                                            LinearGradient(
                                                gradient: Gradient(colors: [
                                                    messageText.isEmpty ? Color.white.opacity(0.1) : Color.blue,
                                                    messageText.isEmpty ? Color.white.opacity(0.05) : Color.blue.opacity(0.8)
                                                ]),
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        .frame(width: 48, height: 48)
                                        .shadow(color: messageText.isEmpty ? .clear : .blue.opacity(0.3), radius: 8, x: 0, y: 4)
                                    
                                    Image(systemName: "arrow.up")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(messageText.isEmpty ? .white.opacity(0.3) : .white)
                                }
                            }
                            .disabled(messageText.isEmpty || isTyping)
                            .scaleEffect(messageText.isEmpty ? 0.9 : 1.0)
                            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: messageText.isEmpty)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 20)
                        .background(
                            Rectangle()
                                .fill(Color.black.opacity(0.1))
                                .blur(radius: 10)
                        )
                    }
                }
            }
        }
        .navigationBarHidden(true)
    }
    
    private func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        let userMessage = messageText
        messageText = ""
        
        Task {
            await chatManager.sendMessage(userMessage)
        }
    }
}

struct PremiumChatMessageView: View {
    let message: ChatMessage
    
    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            if message.isUser {
                Spacer()
                
                VStack(alignment: .trailing, spacing: 8) {
                    Text(message.content)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [Color.blue, Color.blue.opacity(0.8)]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .cornerRadius(20)
                        .cornerRadius(4, corners: .bottomRight)
                        .shadow(color: .blue.opacity(0.3), radius: 8, x: 0, y: 4)
                    
                    Text(formatTime(message.timestamp))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                        .padding(.trailing, 8)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        gradient: Gradient(colors: [Color.green, Color.green.opacity(0.8)]),
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 32, height: 32)
                                .shadow(color: .green.opacity(0.3), radius: 4, x: 0, y: 2)
                            
                            Image(systemName: "sparkles")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        
                        Text(message.content)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 20)
                                    .fill(Color.white.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 20)
                                            .stroke(Color.white.opacity(0.2), lineWidth: 1)
                                    )
                            )
                            .cornerRadius(4, corners: .bottomLeft)
                            .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
                    }
                    
                    Text(formatTime(message.timestamp))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                        .padding(.leading, 44)
                }
                
                Spacer()
            }
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

struct PremiumTypingIndicatorView: View {
    @State private var animationOffset: CGFloat = 0
    @State private var pulseScale: CGFloat = 1.0
    
    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [Color.green, Color.green.opacity(0.8)]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 32, height: 32)
                            .shadow(color: .green.opacity(0.3), radius: 4, x: 0, y: 2)
                            .scaleEffect(pulseScale)
                            .animation(
                                .easeInOut(duration: 1.0)
                                .repeatForever(autoreverses: true),
                                value: pulseScale
                            )
                        
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    
                    HStack(spacing: 6) {
                        ForEach(0..<3) { index in
                            Circle()
                                .fill(Color.white.opacity(0.7))
                                .frame(width: 8, height: 8)
                                .offset(y: animationOffset)
                                .animation(
                                    Animation.easeInOut(duration: 0.8)
                                        .repeatForever()
                                        .delay(Double(index) * 0.2),
                                    value: animationOffset
                                )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.white.opacity(0.1))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                            )
                    )
                    .cornerRadius(4, corners: .bottomLeft)
                    .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
                }
            }
            
            Spacer()
        }
        .onAppear {
            animationOffset = -6
            pulseScale = 1.1
        }
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let content: String
    let isUser: Bool
    let timestamp: Date
}

class ChatBotManager: ObservableObject {
    @Published var messages: [ChatMessage] = []
    private let apiService = StacyAPIService()
    private var sessionId: String
    
    init() {
        self.sessionId = "chat_session_\(Date().timeIntervalSince1970)"
        
        // Add welcome message
        addMessage("Hi! I'm Stacy, your AI safety companion. How can I help you today?", isUser: false)
    }
    
    func sendMessage(_ text: String) async {
        // Add user message
        addMessage(text, isUser: true)
        
        do {
            // Send to backend API
            let result = await apiService.sendChatMessage(
                message: text,
                sessionId: sessionId,
                mode: "chat",
                location: nil
            )
            
            switch result {
            case .success(let response):
                addMessage(response.reply, isUser: false)
            case .failure(let error):
                addMessage("Sorry, I'm having trouble connecting right now. Please try again.", isUser: false)
                print("Chat API error: \(error)")
            }
            
        } catch {
            addMessage("Sorry, I'm having trouble connecting right now. Please try again.", isUser: false)
            print("Chat error: \(error)")
        }
    }
    
    private func addMessage(_ content: String, isUser: Bool) {
        DispatchQueue.main.async {
            self.messages.append(ChatMessage(
                content: content,
                isUser: isUser,
                timestamp: Date()
            ))
        }
    }
    
    func clearChat() {
        messages.removeAll()
        addMessage("Hi! I'm Stacy, your AI safety companion. How can I help you today?", isUser: false)
    }
}

// Extension for custom corner radius
extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

#Preview {
    ChatBotView()
}
