'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

type Terminology = {
  knowledgeGraph: string;
  topic: string;
  topics: string;
  createTopic: string;
  relation: string;
  relations: string;
  createRelation: string;
};

const normie: Terminology = {
  knowledgeGraph: 'Knowledge Graph',
  topic: 'Topic',
  topics: 'Topics',
  createTopic: 'Create a Topic',
  relation: 'Connection',
  relations: 'Connections',
  createRelation: 'Create a Connection',
};

const dev: Terminology = {
  knowledgeGraph: 'Space',
  topic: 'Entity',
  topics: 'Entities',
  createTopic: 'Create an Entity',
  relation: 'Relation',
  relations: 'Relations',
  createRelation: 'Create a Relation',
};

interface TerminologyContextType {
  terms: Terminology;
  isDevMode: boolean;
  toggleMode: () => void;
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined);

export const TerminologyProvider = ({ children }: { children: ReactNode }) => {
  const [isDevMode, setIsDevMode] = useState(false);
  const terms = isDevMode ? dev : normie;

  const toggleMode = () => {
    setIsDevMode((prev) => !prev);
  };

  return (
    <TerminologyContext.Provider value={{ terms, isDevMode, toggleMode }}>
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