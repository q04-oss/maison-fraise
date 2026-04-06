const { withXcodeProject } = require('@expo/config-plugins');
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
  // AR Expanded 4
  'ARUnboxingAnimator.swift',
  'ARNutritionRingsView.swift',
  'ARAllergyFlagView.swift',
  'ARAchievementBadgeView.swift',
  'ARConstellationViewController.swift',
  'ARPriceHistoryView.swift',
  'ARCarbonFootprintView.swift',
  'ARSunlightHoursView.swift',
  'ARFarmVisitCTAView.swift',
  'ARQuantityCounterOverlay.swift',
  'ARStickyNoteView.swift',
  'ARStickyNoteComposer.swift',
  // AR Expanded 5-6
  'ARFlavorMemoryView.swift',
  'ARMicronutrientMosaicView.swift',
  'ARSugarAcidDialView.swift',
  'ARAntioxidantShieldView.swift',
  'ARFermentationCardView.swift',
  'ARPigmentSpectrumView.swift',
  'ARFarmerPortraitView.swift',
  'ARFarmCertWallView.swift',
  'ARFarmFoundingView.swift',
  'ARIrrigationDiagramView.swift',
  'ARCoverCropView.swift',
  'ARMicroclimateView.swift',
  'ARBundleSuggestionView.swift',
  'AREarlyAccessCountdownView.swift',
  'ARPriceDropBadgeView.swift',
  'ARReferralBubbleView.swift',
  'ARGiftRegistryView.swift',
  'ARWordCloudView.swift',
  'ARWhoElseGotThisView.swift',
  'ARMemoryLaneView.swift',
  'ARChallengeQuestView.swift',
  'ARCoScanQRView.swift',
  'ARVarietyStreakLeaderView.swift',
  'ARAmbientAudioView.swift',
  'ARVarietyMascotView.swift',
  'ARThankYouOverlay.swift',
  'AROrderExpiryGridView.swift',
  'ARStaffPerformanceView.swift',
  'ARPostalHeatMapView.swift',
  // AR Expanded 7
  'ARImageAnchorController.swift',
  'ARFarmPortalView.swift',
  'ARTastingPoemView.swift',
  'ARSpatialAudioController.swift',
  'ARPhotosynthesisMeterView.swift',
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

    const targetUuid = project.getFirstTarget().uuid;

    // Create or find the ARBoxModule PBX group so addSourceFile always receives
    // a valid UUID — without one, xcode falls back to the project name string
    // which crashes getPBXVariantGroupByKey when PBXVariantGroup is absent.
    let arGroupKey = project.findPBXGroupKey({ name: 'ARBoxModule' });
    if (!arGroupKey) {
      arGroupKey = project.pbxCreateGroup('ARBoxModule', '"ARBoxModule"');
      const pbxProj = project.pbxProjectSection();
      const projKey = Object.keys(pbxProj).find(k => !k.endsWith('_comment'));
      const mainGroupKey = pbxProj[projKey].mainGroup;
      project.addToPbxGroup({ fileRef: arGroupKey, basename: 'ARBoxModule' }, mainGroupKey);
    }

    // Add each file to compile sources — path is relative to the group,
    // so pass only the filename (group path 'ARBoxModule' + filename = correct disk path)
    for (const file of MODULE_FILES) {
      project.addSourceFile(
        file,
        { target: targetUuid },
        arGroupKey,
      );
    }

    // Link ARKit.framework
    const alreadyLinked = Object.values(project.pbxBuildFileSection() ?? {}).some(
      (f) => f && f.fileRef_comment && f.fileRef_comment.includes('ARKit')
    );
    if (!alreadyLinked) {
      project.addFramework('ARKit.framework', { weak: false, link: true, target: targetUuid });
    }

    return config;
  });
};

module.exports = withARBoxModule;
