"use client";

import { createContext, useContext } from "react";

const EmployeeNameContext = createContext<string>("Você");
const EmployeeBlockContext = createContext<string>("Bloco A");

export function EmployeeIdentityProvider({
  name,
  block = "Bloco A",
  children,
}: {
  name: string;
  block?: string;
  children: React.ReactNode;
}) {
  return (
    <EmployeeNameContext.Provider value={name}>
      <EmployeeBlockContext.Provider value={block}>{children}</EmployeeBlockContext.Provider>
    </EmployeeNameContext.Provider>
  );
}

export function useEmployeeName() {
  return useContext(EmployeeNameContext);
}
export function useEmployeeBlock() {
  return useContext(EmployeeBlockContext);
}
