const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_CODE = `import SwiftUI
import UIKit
import React

@objc(LiquidGlassMorphingMenuManager)
class LiquidGlassMorphingMenuManager: RCTViewManager {

    override init() {
        super.init()
        print("\\u{2705} LiquidGlassMorphingMenuManager initialized")
    }

    override func view() -> UIView! {
        print("\\u{2705} Creating LiquidGlassMorphingMenu view")
        let view = LiquidGlassMorphingMenuView()
        print("\\u{2705} LiquidGlassMorphingMenu view created with frame: \\(view.frame)")
        return view
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

        if #available(iOS 16.0, *) {
            hosting.sizingOptions = .intrinsicContentSize
        }

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

    override var intrinsicContentSize: CGSize {
        let buttonSizeValue = CGFloat(truncating: buttonSize)
        let width = (buttonSizeValue * 2) + 1 + 8 + 8
        let height = buttonSizeValue + 8 + 8
        return CGSize(width: width, height: height)
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

    init(onAction: @escaping (String) -> Void, isCreator: Bool, buttonSize: CGFloat, iconSize: CGFloat) {
        self.onAction = onAction
        self.isCreator = isCreator
        self.buttonSize = buttonSize
        self.iconSize = iconSize
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            glassPillContent
                .glassEffect(.regular.interactive())
                .fixedSize()
        } else {
            glassPillContent
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .fixedSize()
        }
    }

    @ViewBuilder
    private var glassPillContent: some View {
        HStack(spacing: 0) {
            // LEFT: Chat button
            Button(action: {
                onAction("chat")
            }) {
                Image(systemName: "bubble.right")
                    .font(.system(size: iconSize, weight: .medium))
                    .frame(width: buttonSize, height: buttonSize)
            }
            .buttonStyle(.plain)

            // CENTER: Divider
            Rectangle()
                .fill(Color.primary.opacity(0.3))
                .frame(width: 1, height: buttonSize * 0.5)

            // RIGHT: More menu button
            if #available(iOS 16.0, *) {
                Menu {
                    Button(action: {
                        onAction("share")
                    }) {
                        Label("Share Competition", systemImage: "square.and.arrow.up")
                    }

                    Button(action: {
                        onAction("info")
                    }) {
                        Label("Competition Info", systemImage: "info.circle")
                    }

                    Divider()

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
                .buttonStyle(.plain)
            } else {
                Menu {
                    Button(action: {
                        onAction("share")
                    }) {
                        Label("Share Competition", systemImage: "square.and.arrow.up")
                    }

                    Button(action: {
                        onAction("info")
                    }) {
                        Label("Competition Info", systemImage: "info.circle")
                    }

                    Divider()

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
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
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
