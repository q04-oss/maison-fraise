import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OrderState {
  // Database IDs (used for API calls)
  variety_id: number | null;
  location_id: number | null;
  time_slot_id: number | null;
  // Display values (used for UI)
  strawberryName: string | null;
  priceCents: number | null;
  chocolateId: string | null;
  chocolateName: string | null;
  finishId: string | null;
  finishName: string | null;
  quantity: number;
  locationName: string | null;
  date: string | null;
  timeSlotTime: string | null;
  isGift: boolean;
  customerEmail: string | null;
}

interface OrderContextType {
  order: OrderState;
  setVariety: (id: number, name: string, priceCents: number) => void;
  setChocolate: (id: string, name: string) => void;
  setFinish: (id: string, name: string) => void;
  setQuantity: (q: number) => void;
  setLocation: (id: number, name: string) => void;
  setDate: (d: string) => void;
  setTimeSlot: (id: number, time: string) => void;
  setIsGift: (g: boolean) => void;
  setCustomerEmail: (e: string) => void;
  resetOrder: () => void;
}

const defaultOrder: OrderState = {
  variety_id: null,
  location_id: null,
  time_slot_id: null,
  strawberryName: null,
  priceCents: null,
  chocolateId: null,
  chocolateName: null,
  finishId: null,
  finishName: null,
  quantity: 4,
  locationName: null,
  date: null,
  timeSlotTime: null,
  isGift: false,
  customerEmail: null,
};

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<OrderState>(defaultOrder);

  return (
    <OrderContext.Provider
      value={{
        order,
        setVariety: (variety_id, strawberryName, priceCents) =>
          setOrder((prev) => ({ ...prev, variety_id, strawberryName, priceCents })),
        setChocolate: (chocolateId, chocolateName) =>
          setOrder((prev) => ({ ...prev, chocolateId, chocolateName })),
        setFinish: (finishId, finishName) =>
          setOrder((prev) => ({ ...prev, finishId, finishName })),
        setQuantity: (quantity) =>
          setOrder((prev) => ({ ...prev, quantity })),
        setLocation: (location_id, locationName) =>
          setOrder((prev) => ({ ...prev, location_id, locationName })),
        setDate: (date) => setOrder((prev) => ({ ...prev, date })),
        setTimeSlot: (time_slot_id, timeSlotTime) =>
          setOrder((prev) => ({ ...prev, time_slot_id, timeSlotTime })),
        setIsGift: (isGift) => setOrder((prev) => ({ ...prev, isGift })),
        setCustomerEmail: (customerEmail) =>
          setOrder((prev) => ({ ...prev, customerEmail })),
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