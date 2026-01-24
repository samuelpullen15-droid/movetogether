const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_CODE = `import SwiftUI
import UIKit
import React

@objc(LiquidGlassMorphingMenuManager)
class LiquidGlassMorphingMenuManager: RCTViewManager {
    override func view() -> UIView! {
        return LiquidGlassMorphingMenuView()
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}

class LiquidGlassMorphingMenuView: UIView {
    private var hostingController: UIHostingController<GlassMorphingMenuContent>?

    @objc var onMenuAction: RCTDirectEventBlock?
    @objc var isCreator: Bool = false {
        didSet {
            updateSwiftUIView()
        }
    }
    @objc var buttonSize: NSNumber = 24 {
        didSet {
            updateSwiftUIView()
        }
    }
    @objc var iconSize: NSNumber = 16 {
        didSet {
            updateSwiftUIView()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupSwiftUIView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupSwiftUIView()
    }

    private func setupSwiftUIView() {
        let swiftUIView = GlassMorphingMenuContent(
            onAction: { [weak self] action in
                self?.onMenuAction?(["action": action])
            },
            isCreator: isCreator,
            buttonSize: CGFloat(truncating: buttonSize),
            iconSize: CGFloat(truncating: iconSize)
        )

        let hosting = UIHostingController(rootView: swiftUIView)
        hosting.view.backgroundColor = .clear
        hosting.view.translatesAutoresizingMaskIntoConstraints = false

        addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: topAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])

        hostingController = hosting
    }

    private func updateSwiftUIView() {
        guard let hosting = hostingController else { return }

        let updatedView = GlassMorphingMenuContent(
            onAction: { [weak self] action in
                self?.onMenuAction?(["action": action])
            },
            isCreator: isCreator,
            buttonSize: CGFloat(truncating: buttonSize),
            iconSize: CGFloat(truncating: iconSize)
        )

        hosting.rootView = updatedView
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        hostingController?.view.frame = bounds
    }
}

struct GlassMorphingMenuContent: View {
    let onAction: (String) -> Void
    let isCreator: Bool
    let buttonSize: CGFloat
    let iconSize: CGFloat

    var body: some View {
        if #available(iOS 26.0, *) {
            // iOS 26+ with native Menu and liquid glass morphing
            Menu {
                if isCreator {
                    Button(role: .destructive, action: {
                        onAction("delete")
                    }) {
                        Label("Delete Competition", systemImage: "trash")
                    }
                } else {
                    Button(action: {
                        onAction("leave")
                    }) {
                        Label("Leave Competition", systemImage: "person.badge.minus")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: iconSize, weight: .medium))
                    .frame(width: buttonSize, height: buttonSize)
            }
            .menuOrder(.fixed)
            .glassEffect(.regular.interactive())
        } else if #available(iOS 17.0, *) {
            // iOS 17-25 fallback with bordered style
            Button(action: {
                // For older iOS, just trigger the action immediately
                if isCreator {
                    onAction("delete")
                } else {
                    onAction("leave")
                }
            }) {
                Image(systemName: "ellipsis")
                    .font(.system(size: iconSize, weight: .medium))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .tint(.primary)
        } else {
            // iOS 15-16 fallback
            Button(action: {
                if isCreator {
                    onAction("delete")
                } else {
                    onAction("leave")
                }
            }) {
                Image(systemName: "ellipsis")
                    .font(.system(size: iconSize, weight: .medium))
                    .foregroundColor(.primary)
            }
            .background(.ultraThinMaterial)
            .clipShape(Circle())
        }
    }
}
`;

const OBJC_MANAGER = `#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiquidGlassMorphingMenuManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(onMenuAction, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(isCreator, BOOL)
RCT_EXPORT_VIEW_PROPERTY(buttonSize, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(iconSize, NSNumber)

@end
`;

/**
 * Expo config plugin to add native SwiftUI liquid glass morphing menu
 * Generates Swift and Objective-C files for iOS 26 glass effect morphing
 */
function withLiquidGlassMorphingMenu(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosPath = path.join(cfg.modRequest.projectRoot, 'ios', 'MoveTogether');

      if (!fs.existsSync(iosPath)) {
        fs.mkdirSync(iosPath, { recursive: true });
      }

      // Write Swift implementation
      fs.writeFileSync(path.join(iosPath, 'LiquidGlassMorphingMenuView.swift'), SWIFT_CODE);

      // Write Objective-C manager
      fs.writeFileSync(path.join(iosPath, 'LiquidGlassMorphingMenuManager.m'), OBJC_MANAGER);

      console.log('✅ Created LiquidGlassMorphingMenu native files (Swift + Objective-C)');

      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const targetName = 'MoveTogether';

    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    let targetGroupKey = null;

    for (const key in groups) {
      const group = groups[key];
      if (group && (group.name === targetName || group.path === targetName)) {
        targetGroupKey = key;
        break;
      }
    }

    if (targetGroupKey) {
      try {
        // Add Swift file
        xcodeProject.addSourceFile(
          targetName + '/LiquidGlassMorphingMenuView.swift',
          { target: xcodeProject.getFirstTarget().uuid },
          targetGroupKey
        );
        console.log('✅ Added LiquidGlassMorphingMenuView.swift to Xcode project');
      } catch (e) {
        console.log('⚠️ LiquidGlassMorphingMenuView.swift may already exist in project');
      }

      try {
        // Add Objective-C manager
        xcodeProject.addSourceFile(
          targetName + '/LiquidGlassMorphingMenuManager.m',
          { target: xcodeProject.getFirstTarget().uuid },
          targetGroupKey
        );
        console.log('✅ Added LiquidGlassMorphingMenuManager.m to Xcode project');
      } catch (e) {
        console.log('⚠️ LiquidGlassMorphingMenuManager.m may already exist in project');
      }
    }

    return cfg;
  });

  return config;
}

module.exports = withLiquidGlassMorphingMenu;
