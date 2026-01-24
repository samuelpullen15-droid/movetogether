const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_CODE = `import SwiftUI
import UIKit
import React

@objc(LiquidGlassButtonManager)
class LiquidGlassButtonManager: RCTViewManager {
    override func view() -> UIView! {
        return LiquidGlassButtonView()
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}

class LiquidGlassButtonView: UIView {
    private var hostingController: UIHostingController<GlassButtonContent>?

    @objc var onButtonPress: RCTDirectEventBlock?
    @objc var size: NSNumber = 40 {
        didSet {
            updateSwiftUIView()
        }
    }
    @objc var iconSize: NSNumber = 24 {
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
        let swiftUIView = GlassButtonContent(
            onPress: { [weak self] in
                self?.onButtonPress?([:])
            },
            size: CGFloat(truncating: size),
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

        let updatedView = GlassButtonContent(
            onPress: { [weak self] in
                self?.onButtonPress?([:])
            },
            size: CGFloat(truncating: size),
            iconSize: CGFloat(truncating: iconSize)
        )

        hosting.rootView = updatedView
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        hostingController?.view.frame = bounds
    }
}

struct GlassButtonContent: View {
    let onPress: () -> Void
    let size: CGFloat
    let iconSize: CGFloat

    var body: some View {
        if #available(iOS 26.0, *) {
            // Use true liquid glass on iOS 26+
            Button(action: onPress) {
                Image(systemName: "chevron.left")
                    .font(.system(size: iconSize, weight: .medium))
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .frame(width: size, height: size)
        } else if #available(iOS 17.0, *) {
            // Use bordered style with material on iOS 17+
            Button(action: onPress) {
                Image(systemName: "chevron.left")
                    .font(.system(size: iconSize, weight: .medium))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .tint(.primary)
            .frame(width: size, height: size)
        } else {
            // Fallback for iOS 15-16
            Button(action: onPress) {
                Image(systemName: "chevron.left")
                    .font(.system(size: iconSize, weight: .medium))
                    .foregroundColor(.primary)
            }
            .frame(width: size, height: size)
            .background(.ultraThinMaterial)
            .clipShape(Circle())
        }
    }
}
`;

const OBJC_MANAGER = `#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiquidGlassButtonManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(onButtonPress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(size, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(iconSize, NSNumber)

@end
`;

function withLiquidGlassButton(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosPath = path.join(cfg.modRequest.projectRoot, 'ios', 'MoveTogether');

      if (!fs.existsSync(iosPath)) {
        fs.mkdirSync(iosPath, { recursive: true });
      }

      // Write Swift implementation
      fs.writeFileSync(path.join(iosPath, 'LiquidGlassButtonView.swift'), SWIFT_CODE);

      // Write Objective-C manager
      fs.writeFileSync(path.join(iosPath, 'LiquidGlassButtonManager.m'), OBJC_MANAGER);

      console.log('✅ Created LiquidGlassButton native files (Swift + Objective-C)');

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
          targetName + '/LiquidGlassButtonView.swift',
          { target: xcodeProject.getFirstTarget().uuid },
          targetGroupKey
        );
        console.log('✅ Added LiquidGlassButtonView.swift to Xcode project');
      } catch (e) {
        console.log('⚠️ LiquidGlassButtonView.swift may already exist in project');
      }

      try {
        // Add Objective-C manager
        xcodeProject.addSourceFile(
          targetName + '/LiquidGlassButtonManager.m',
          { target: xcodeProject.getFirstTarget().uuid },
          targetGroupKey
        );
        console.log('✅ Added LiquidGlassButtonManager.m to Xcode project');
      } catch (e) {
        console.log('⚠️ LiquidGlassButtonManager.m may already exist in project');
      }
    }

    return cfg;
  });

  return config;
}

module.exports = withLiquidGlassButton;
