import React, { createContext, useContext, useState } from 'react';

export interface CartLine {
  lineId: string;
  item: any;
  qty: number;
}

interface CartState {
  carts: Record<string, any[]>;
  activeTableId: string;
  activeTableName: string;
  setActiveTable: (id: string, name: string) => void;
  getCart: (tableId: string) => CartLine[];
  addItem: (tableId: string, item: any, mods?: any[]) => void;
  adjQty: (tableId: string, lineId: string, delta: number) => void;
  clearCart: (tableId: string) => void;
}

const CartContext = createContext<CartState>({} as CartState);

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<Record<string, CartLine[]>>({});
  const [activeTableId, setActiveTableId] = useState('quick');
  const [activeTableName, setActiveTableName] = useState('Hitra prodaja');

  function setActiveTable(id: string, name: string) {
    console.log('SET ACTIVE TABLE:', id, name);
    setActiveTableId(id);
    setActiveTableName(name);
  }

  function getCart(tableId: string): CartLine[] {
    return carts[tableId] || [];
  }

  function addItem(tableId: string, item: any, mods: any[] = []) {
    setCarts(prev => {
      const current = prev[tableId] || [];
      const ex = current.find(l => l.item.id === item.id);
      if (ex) {
        return { ...prev, [tableId]: current.map(l => l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l) };
      }
      const modPrice = mods.reduce((s: number, m: any) => s + m.priceDelta, 0);
      const itemWithMods = { ...item, price: item.price + modPrice };
      return { ...prev, [tableId]: [...current, { lineId: Date.now().toString(), item: itemWithMods, qty: 1 }] };
    });
  }

  function adjQty(tableId: string, lineId: string, delta: number) {
    setCarts(prev => {
      const current = prev[tableId] || [];
      const line = current.find(l => l.lineId === lineId);
      if (!line) return prev;
      if (line.qty + delta <= 0) {
        return { ...prev, [tableId]: current.filter(l => l.lineId !== lineId) };
      }
      return { ...prev, [tableId]: current.map(l => l.lineId === lineId ? { ...l, qty: l.qty + delta } : l) };
    });
  }

  function clearCart(tableId: string) {
    setCarts(prev => ({ ...prev, [tableId]: [] }));

  }

  return (
    <CartContext.Provider value={{ carts, activeTableId, activeTableName, setActiveTable, getCart, addItem, adjQty, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}
