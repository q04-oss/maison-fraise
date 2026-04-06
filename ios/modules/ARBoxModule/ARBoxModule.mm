#import <React/RCTBridgeModule.h>

RCT_EXTERN_MODULE(ARBoxModule, NSObject)

RCT_EXTERN_METHOD(
  presentAR:(NSDictionary *)varietyData
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)
