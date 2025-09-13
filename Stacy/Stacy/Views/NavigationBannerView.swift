//
//  NavigationBannerView.swift
//  Stacy
//
//  Created by Kevin He on 2025-09-10.
//

import SwiftUI

struct NavigationBannerView: View {
    let currentStep: DirectionStep
    let stepNumber: Int
    let totalSteps: Int
    
    var body: some View {
        VStack(spacing: 0) {
            // Main banner
            HStack(spacing: 16) {
                // Direction icon
                VStack {
                    Image(systemName: getDirectionIcon(currentStep.instruction))
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Color.blue.opacity(0.8))
                        .cornerRadius(25)
                }
                
                // Instruction text
                VStack(alignment: .leading, spacing: 4) {
                    Text(currentStep.instruction)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    
                    HStack {
                        Text(currentStep.distance)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white.opacity(0.8))
                        
                        Spacer()
                        
                        Text("\(stepNumber) of \(totalSteps)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.2))
                            .cornerRadius(8)
                    }
                }
                
                Spacer()
            }
            .padding(20)
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [Color.blue.opacity(0.9), Color.blue.opacity(0.7)]),
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.3), radius: 8, x: 0, y: 4)
            
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.white.opacity(0.3))
                        .frame(height: 4)
                    
                    Rectangle()
                        .fill(Color.white)
                        .frame(width: geometry.size.width * (Double(stepNumber) / Double(totalSteps)), height: 4)
                }
            }
            .frame(height: 4)
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .padding(.horizontal)
    }
    
    private func getDirectionIcon(_ instruction: String) -> String {
        let lowercased = instruction.lowercased()
        
        if lowercased.contains("turn left") {
            return "arrow.turn.up.left"
        } else if lowercased.contains("turn right") {
            return "arrow.turn.up.right"
        } else if lowercased.contains("continue straight") || lowercased.contains("go straight") {
            return "arrow.up"
        } else if lowercased.contains("arrive") || lowercased.contains("destination") {
            return "flag.fill"
        } else if lowercased.contains("merge") {
            return "arrow.merge"
        } else if lowercased.contains("exit") {
            return "arrow.down.right"
        } else if lowercased.contains("u-turn") {
            return "arrow.uturn.backward"
        } else {
            return "arrow.up"
        }
    }
}
