import { NavigatorScreenParams } from '@react-navigation/native';

export type OrderStackParamList = {
  Step1Strawberry: undefined;
  Step2Chocolate: undefined;
  Step3Finish: undefined;
  Step4Quantity: undefined;
  Step5Where: undefined;
  Step6When: undefined;
  Step7Review: undefined;
};

export type RootTabParamList = {
  Board: undefined;
  Where: undefined;
  Events: undefined;
  Order: NavigatorScreenParams<OrderStackParamList> | undefined;
  Orders: undefined;
};
