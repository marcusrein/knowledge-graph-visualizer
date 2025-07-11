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
  inspectorLabel: string;
  inspectorRelationLabel: string; // New field for relation-specific label
  inspectorProperties: string;
  inspectorAddProperty: string;
  inspectorPropertyKey: string;
  inspectorPropertyValue: string;
  relationSpaceToast: string;
};

const normie: Terminology = {
  knowledgeGraph: 'Knowledge Graph Visualizer',
  topic: 'Topic',
  topics: 'Topics',
  createTopic: 'Create a Topic',
  relation: 'Relation', // Changed from 'Connection' to 'Relation'
  relations: 'Relations', // Changed from 'Connections' to 'Relations'
  createRelation: 'Create a Relation', // Changed from 'Create a Connection'
  inspectorLabel: 'Name',
  inspectorRelationLabel: 'Name', // For normie mode, relations still use "Name"
  inspectorProperties: 'Details',
  inspectorAddProperty: '+ Add Detail',
  inspectorPropertyKey: 'Attribute',
  inspectorPropertyValue: 'Value',
  relationSpaceToast: 'Relations are always accessible to everyone, regardless of which Space they appear in. Moving them doesn\'t change their visibility.',
};

const dev: Terminology = {
  knowledgeGraph: 'Knowledge Graph Visualizer',
  topic: 'Entity',
  topics: 'Entities',
  createTopic: 'Create an Entity',
  relation: 'Relation',
  relations: 'Relations',
  createRelation: 'Create a Relation',
  inspectorLabel: 'Name',
  inspectorRelationLabel: 'Type', // In dev mode, relations use "Type" per GRC20 spec
  inspectorProperties: 'Attributes',
  inspectorAddProperty: '+ Add Attribute',
  inspectorPropertyKey: 'Key',
  inspectorPropertyValue: 'Value',
  relationSpaceToast: 'Relations have global scope per GRC-20 spec. Their visibility and accessibility are not affected by Space boundaries or permissions.',
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