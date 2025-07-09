'use client';

import { createContext, useState, useContext, ReactNode } from 'react';

type TerminologyMode = 'dev' | 'normie';

interface TerminologyContextType {
  mode: TerminologyMode;
  toggleMode: () => void;
  getTerm: (devTerm: string) => string;
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined);

const terminologyMap: Record<string, { dev: string; normie: string }> = {
  ENTITY: { dev: 'Entity', normie: 'Topic' },
  RELATION: { dev: 'Relation', normie: 'Relation' },
  PROPERTIES: { dev: 'Properties', normie: 'Details' },
  ADD_ENTITY: { dev: 'Add Entity', normie: 'Add Topic' },
  ERROR_CONNECT_ENTITIES: { dev: 'Can only connect main entities', normie: 'Can only connect Topics' },
};

export const TerminologyProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<TerminologyMode>('normie');

  const toggleMode = () => {
    setMode((prevMode) => (prevMode === 'dev' ? 'normie' : 'dev'));
  };

  const getTerm = (devTermKey: string) => {
    const term = terminologyMap[devTermKey];
    return term ? term[mode] : devTermKey;
  };

  return (
    <TerminologyContext.Provider value={{ mode, toggleMode, getTerm }}>
      {children}
    </TerminologyContext.Provider>
  );
};

export const useTerminology = () => {
  const context = useContext(TerminologyContext);
  if (context === undefined) {
    throw new Error('useTerminology must be used within a TerminologyProvider');
  }
  return context;
}; 