import React, { createContext, useContext, useEffect, useState } from 'react';

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

export function CartProvider({ children, orgId }: { children: React.ReactNode; orgId?: string | null }) {
  const [carts, setCarts] = useState<Record<string, CartLine[]>>({});
  const [activeTableId, setActiveTableId] = useState('quick');
  const [activeTableName, setActiveTableName] = useState('Hitra prodaja');

  // Menjava podjetja (16.10.2026): kosarice in aktivna miza pripadajo
  // prejsnjemu podjetju (njegovi artikli in mize) - pobrisi jih.
  useEffect(() => {
    setCarts({});
    setActiveTableId('quick');
    setActiveTableName('Hitra prodaja');
  }, [orgId]);

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
      // Univerzalni artikel (cena ob prodaji, 16.10.2026): vsak vnos je svoja
      // vrstica - zneski so razlicni, zato se ne zdruzuje.
      const ex = item.cenaVnesena ? null : current.find(l => l.item.id === item.id && !l.item.cenaVnesena);
      if (ex) {
        return { ...prev, [tableId]: current.map(l => l.lineId === ex.lineId ? { ...l, qty: l.qty + 1 } : l) };
      }
      const modPrice = mods.reduce((s: number, m: any) => s + m.priceDelta, 0);
      const itemWithMods = { ...item, price: item.price + modPrice };
      const lineId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      return { ...prev, [tableId]: [...current, { lineId, item: itemWithMods, qty: 1 }] };
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
