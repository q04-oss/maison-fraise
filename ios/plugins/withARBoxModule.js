const { withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const MODULE_FILES = [
  'ARBoxModule.mm',
  'ARBoxModule.swift',
  'ARBoxViewController.swift',
  'ARCardView.swift',
  'ARGiftCardView.swift',
  'ARStaffOverlay.swift',
  'ARMarketStallCardView.swift',
  'ARFlavorWheelView.swift',
  'ARFreshnessRingView.swift',
  'ARPairingCardView.swift',
  'ARCollectifAvatarsView.swift',
  'ARSeasonalTimelineView.swift',
  'ARPassportStampView.swift',
  'ARDropAlertView.swift',
  'ARBatchScanOverlay.swift',
  // AR Expanded 3
  'ARBrixScoreView.swift',
  'ARGrowingMethodBadge.swift',
  'ARLineageTreeView.swift',
  'ARAltitudeSoilChipView.swift',
  'AROptimalEatingView.swift',
  'ARRecipeCardView.swift',
  'ARWeatherAtHarvestView.swift',
  'ARFarmPhotoView.swift',
  'ARTastingJournalOverlay.swift',
  'ARSocialShareView.swift',
  'ARVarietyMapView.swift',
  'ARStreakFlameView.swift',
  'ARCollectifRankView.swift',
  'ARProducerVideoView.swift',
  'AROrderRoutingGrid.swift',
  'ARColdChainView.swift',
];

const SOURCE_DIR = path.join(__dirname, '..', 'modules', 'ARBoxModule');

/**
 * Config plugin that:
 * 1. Copies the ARBoxModule native sources into the generated Xcode project
 * 2. Adds each file to the main app target's compile sources
 * 3. Links ARKit.framework
 */
const withARBoxModule = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const iosRoot = path.join(projectRoot, 'ios');

    // Destination inside the generated ios/ folder
    const destDir = path.join(iosRoot, 'ARBoxModule');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy source files into generated ios/ tree
    for (const file of MODULE_FILES) {
      const src = path.join(SOURCE_DIR, file);
      const dest = path.join(destDir, file);
      fs.copyFileSync(src, dest);
    }

    // Get the main app target name (first native target)
    const targetName = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project,
    }).name;

    // Add each file to compile sources
    for (const file of MODULE_FILES) {
      const filePath = path.join('ARBoxModule', file);
      // Avoid duplicates on repeated prebuild
      const existing = project.pbxFileByPath(filePath);
      if (!existing) {
        project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, targetName);
      }
    }

    // Link ARKit.framework (weak: false — it ships on all supported devices)
    const frameworks = project.pbxFrameworksBuildPhaseObj(project.getFirstTarget().uuid);
    const alreadyLinked = Object.values(project.pbxBuildFileSection() ?? {}).some(
      (f) => f && f.fileRef_comment && f.fileRef_comment.includes('ARKit')
    );
    if (!alreadyLinked) {
      project.addFramework('ARKit.framework', {
        weak: false,
        link: true,
        target: project.getFirstTarget().uuid,
      });
    }

    return config;
  });
};

module.exports = withARBoxModule;
