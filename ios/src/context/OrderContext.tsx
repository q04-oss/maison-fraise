import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  Strawberry,
  Chocolate,
  Finish,
  CollectionLocation,
  TimeSlot,
} from '../data/seed';

interface OrderState {
  strawberry: Strawberry | null;
  chocolate: Chocolate | null;
  finish: Finish | null;
  quantity: number;
  location: CollectionLocation | null;
  date: string | null;
  timeSlot: TimeSlot | null;
  isGift: boolean;
}

interface OrderContextType {
  order: OrderState;
  setStrawberry: (s: Strawberry) => void;
  setChocolate: (c: Chocolate) => void;
  setFinish: (f: Finish) => void;
  setQuantity: (q: number) => void;
  setLocation: (l: CollectionLocation) => void;
  setDate: (d: string) => void;
  setTimeSlot: (t: TimeSlot | null) => void;
  setIsGift: (g: boolean) => void;
  resetOrder: () => void;
}

const defaultOrder: OrderState = {
  strawberry: null,
  chocolate: null,
  finish: null,
  quantity: 4,
  location: null,
  date: null,
  timeSlot: null,
  isGift: false,
};

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<OrderState>(defaultOrder);

  return (
    <OrderContext.Provider
      value={{
        order,
        setStrawberry: (strawberry) =>
          setOrder((prev) => ({ ...prev, strawberry })),
        setChocolate: (chocolate) =>
          setOrder((prev) => ({ ...prev, chocolate })),
        setFinish: (finish) => setOrder((prev) => ({ ...prev, finish })),
        setQuantity: (quantity) =>
          setOrder((prev) => ({ ...prev, quantity })),
        setLocation: (location) =>
          setOrder((prev) => ({ ...prev, location })),
        setDate: (date) => setOrder((prev) => ({ ...prev, date })),
        setTimeSlot: (timeSlot) =>
          setOrder((prev) => ({ ...prev, timeSlot })),
        setIsGift: (isGift) => setOrder((prev) => ({ ...prev, isGift })),
        resetOrder: () => setOrder(defaultOrder),
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrder must be used within OrderProvider');
  return context;
}
