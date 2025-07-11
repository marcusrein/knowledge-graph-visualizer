import { useState, useEffect, memo, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useTerminology } from '@/lib/TerminologyContext';
import { Node } from 'reactflow';
import { Info, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { deepEqual } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import DeleteConfirmModal from './DeleteConfirmModal';

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (
    nodeId: string,
    data: { label?: string; properties?: Record<string, string>; visibility?: 'public' | 'private' }
  ) => void;
  onDelete: (nodeId: string, isRelation: boolean) => void;
}

interface Property {
  id: number;
  key: string;
  value: string;
}

interface EditHistoryEntry {
  id: number;
  nodeId: string;
  nodeType: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  editorAddress: string | null;
  timestamp: string;
}

const safeParseProperties = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, string>;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const Inspector = ({ selectedNode, onClose, onSave, onDelete }: InspectorProps) => {
  const { terms, isDevMode } = useTerminology();
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [nextId, setNextId] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [owner, setOwner] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(true);
  const { address } = useAccount();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Fetch edit history for the selected node
  const editHistoryQuery = useQuery({
    queryKey: ['editHistory', selectedNode?.id],
    queryFn: async () => {
      if (!selectedNode) return [];
      const res = await fetch(`/api/edit-history?nodeId=${selectedNode.id}`);
      if (!res.ok) throw new Error('Failed to fetch edit history');
      const data = await res.json();
      return data as EditHistoryEntry[];
    },
    enabled: !!selectedNode && showHistory,
  });

  // Helper to format field names for display
  const formatFieldName = (field: string | null): string => {
    if (!field) return 'Unknown';
    return field.charAt(0).toUpperCase() + field.slice(1);
  };

  // Helper to format wallet address for display
  const formatAddress = (address: string | null): string => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Helper to format timestamp for display
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Refs for tracking state and preventing unnecessary saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<{label: string; properties: Record<string, string>} | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);

  // Auto-save function with debouncing
  const debouncedSave = useCallback(() => {
    if (!selectedNode) return;

    const currentData = {
      label,
      properties: properties.reduce((acc, prop) => {
        if (prop.key) acc[prop.key] = prop.value;
        return acc;
      }, {} as Record<string, string>)
    };

    // Check if data has actually changed to avoid unnecessary saves
    if (lastSavedDataRef.current && deepEqual(lastSavedDataRef.current, currentData)) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      onSave(selectedNode.id, currentData);
      lastSavedDataRef.current = currentData;
    }, 800); // 800ms debounce delay
  }, [selectedNode, label, properties, onSave]);

  // Immediate save function for blur events
  const immediateSave = useCallback(() => {
    if (!selectedNode) return;

    const currentData = {
      label,
      properties: properties.reduce((acc, prop) => {
        if (prop.key) acc[prop.key] = prop.value;
        return acc;
      }, {} as Record<string, string>)
    };

    // Check if data has actually changed
    if (lastSavedDataRef.current && deepEqual(lastSavedDataRef.current, currentData)) {
      return;
    }

    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Save immediately
    onSave(selectedNode.id, currentData);
    lastSavedDataRef.current = currentData;
  }, [selectedNode, label, properties, onSave]);

  // Initialize form state when selectedNode changes (but not when just mode changes)
  useEffect(() => {
    if (selectedNode && selectedNode.id !== selectedNodeIdRef.current) {
      // Node actually changed, reset form state
      selectedNodeIdRef.current = selectedNode.id;
      
      // Apply the same default label transformation logic as in the main page
      let displayLabel = selectedNode.data.label;
      if (selectedNode.data.label === 'New Topic' || selectedNode.data.label === 'New Entity') {
        displayLabel = isDevMode ? 'New Entity' : 'New Topic';
      }
      setLabel(displayLabel);
      
      const propsObject = safeParseProperties(selectedNode.data.properties);
      const propsArray = Object.entries(propsObject).map(([key, value], index) => ({
        id: index,
        key,
        value: String(value),
      }));
      setProperties(propsArray);
      setNextId(propsArray.length);

      if (selectedNode.type === 'group') {
        setVisibility(selectedNode.data.visibility ?? 'public');
        setOwner(selectedNode.data.owner);
      }

      // Reset last saved data reference
      lastSavedDataRef.current = null;
    }
  }, [selectedNode, isDevMode]);

  // Update label display when only mode changes (preserve user input)
  useEffect(() => {
    if (selectedNode && selectedNode.id === selectedNodeIdRef.current) {
      // Same node, but mode might have changed - only update if it's a default label
      if (label === 'New Topic' || label === 'New Entity') {
        setLabel(isDevMode ? 'New Entity' : 'New Topic');
      }
    }
  }, [isDevMode, selectedNode, label]);

  // Auto-save when label changes
  useEffect(() => {
    if (selectedNode && selectedNode.id === selectedNodeIdRef.current) {
      debouncedSave();
    }
  }, [label, debouncedSave, selectedNode]);

  // Auto-save when properties change
  useEffect(() => {
    if (selectedNode && selectedNode.id === selectedNodeIdRef.current) {
      debouncedSave();
    }
  }, [properties, debouncedSave, selectedNode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!selectedNode) return null;

  const isRelation = /^\d+$/.test(selectedNode.id);
  const isSpace = selectedNode.type === 'group';

  // Common description for Space label (same for dev & normie)
  const spaceLabelDescription =
    'Spaces encapsulate a self-contained knowledge graph along with its governance and access-control rules. They let communities or individuals manage who can read, write, and anchor edits under a consistent policy.';

  // Common delete handler usable in all inspector modes
  function handleDelete() {
    setShowDeleteModal(true);
  }

  function handleConfirmDelete() {
    if (selectedNode) {
      onDelete(selectedNode.id, isRelation);
      setShowDeleteModal(false);
    }
  }

  /* ---------- SPACE INSPECTOR ---------- */
  if (isSpace) {
    const canEditVisibility = owner && address && address.toLowerCase() === owner.toLowerCase();

    const handleSpaceLabelChange = (value: string) => {
      setLabel(value);
      // Immediate save for spaces (simpler, less frequent changes)
      setTimeout(() => {
        onSave(selectedNode.id, { label: value, visibility });
      }, 500);
    };

    const handleVisibilityChange = (value: 'public' | 'private') => {
      setVisibility(value);
      // Immediate save for visibility changes
      onSave(selectedNode.id, { label, visibility: value });
    };

    return (
      <>
        <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Space Inspector</h3>
            <button onClick={onClose} className="btn btn-sm btn-ghost">&times;</button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-sm font-medium text-gray-400">Label</label>
                <Info
                  className="w-4 h-4 text-gray-400 cursor-pointer"
                  data-tooltip-id="inspector-tooltip"
                  data-tooltip-content={spaceLabelDescription}
                />
              </div>
              <input
                className="input input-bordered w-full"
                value={label}
                onChange={(e) => handleSpaceLabelChange(e.target.value)}
                onBlur={() => onSave(selectedNode.id, { label, visibility })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Visibility</label>
              <select
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                value={visibility}
                disabled={!canEditVisibility}
                onChange={(e) => handleVisibilityChange(e.target.value as 'public' | 'private')}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              {!canEditVisibility && (
                <p className="text-xs text-gray-500 mt-1">Only the owner can change visibility</p>
              )}
            </div>

            {/* Edit History Section for Spaces */}
            <div>
              <button
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-400 hover:text-gray-300 transition-colors"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Clock size={16} />
                Edit History
              </button>
              
              {showHistory && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-gray-800/50 rounded-lg p-3">
                  {editHistoryQuery.isLoading && (
                    <div className="text-xs text-gray-500">Loading history...</div>
                  )}
                  
                  {editHistoryQuery.error && (
                    <div className="text-xs text-red-400">Failed to load history</div>
                  )}
                  
                                   {editHistoryQuery.data && editHistoryQuery.data.length > 0 ? (
                   <div className="space-y-2">
                     {editHistoryQuery.data.map((entry, index) => {
                       const isCreation = entry.action === 'create';
                       const isLastEntry = index === editHistoryQuery.data.length - 1;
                       
                       return (
                         <div key={entry.id} className={`text-xs border-b border-gray-700 pb-2 last:border-b-0 ${isCreation ? 'bg-green-900/20 rounded px-2 py-1' : ''}`}>
                           <div className="flex justify-between items-start">
                             <div className="flex-1">
                               <div className="text-gray-300">
                                                               {isCreation ? (
                                <span className="font-medium text-green-400">
                                  Created {isLastEntry ? 'this' : ''} {entry.nodeType === 'relation' ? 'relation' : entry.nodeType}
                                </span>
                                 ) : (
                                   <span>
                                     <span className="font-medium">{formatFieldName(entry.field)}</span> updated
                                   </span>
                                 )}
                               </div>
                               {entry.newValue && (
                                 <div className="text-gray-500 mt-1 truncate">
                                   {isCreation ? (
                                     <span className="text-green-300">
                                       Initial name: {entry.newValue.length > 40 ? `${entry.newValue.substring(0, 40)}...` : entry.newValue}
                                     </span>
                                   ) : (
                                     <span>
                                       {entry.newValue.length > 50 
                                         ? `${entry.newValue.substring(0, 50)}...` 
                                         : entry.newValue}
                                     </span>
                                   )}
                                 </div>
                               )}
                             </div>
                             <div className="text-gray-500 text-right ml-2">
                               <div className={isCreation ? 'text-green-400' : ''}>{formatAddress(entry.editorAddress)}</div>
                               <div className={`text-gray-600 ${isCreation ? 'text-green-500' : ''}`}>{formatTimestamp(entry.timestamp)}</div>
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 ) : editHistoryQuery.data && editHistoryQuery.data.length === 0 ? (
                   <div className="text-xs text-gray-500">No edit history available</div>
                 ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button className="btn btn-error w-full" onClick={handleDelete}>Delete</button>
          </div>
          <Tooltip id="inspector-tooltip" className="z-50 max-w-xs" />
        </aside>

        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
          itemType={isSpace ? 'Space' : 'Topic'}
          itemName={selectedNode?.data?.label || 'Untitled'}
        />
      </>
    );
  }

  /* ---------- TOPIC / RELATION INSPECTOR ---------- */
  const handlePropertyChange = (id: number, part: 'key' | 'value', value: string) => {
    setProperties((currentProperties) =>
      currentProperties.map((p) => (p.id === id ? { ...p, [part]: value } : p))
    );
  };

  const handleAddProperty = () => {
    setProperties([...properties, { id: nextId, key: '', value: '' }]);
    setNextId(nextId + 1);
  };

  const handleRemoveProperty = (id: number) => {
    setProperties(properties.filter((p) => p.id !== id));
  };

  const topicDescription =
    'Topics are the core concepts or objects in your knowledge graph. They can be anything—ideas, projects, or people.';
  const relationDescription =
    "Relations define relationships between Topics. They explain HOW two things are related. Examples: 'founded', 'lives in', 'works for', 'collaborated with'. The relation name should be a verb or phrase that makes sense when reading from the source Topic to the target Topic.";
  const topicDevDescription =
    "An Entity is a unique identifier representing a person, place, or idea. It's the 'node' in the graph, defined by its values.";
  const relationDevDescription =
    "A Relation represents a directed relationship between two Entities. It has a `type` (the relationship name) and can store additional properties as metadata. Relations form the edges of the knowledge graph, enabling complex semantic queries.";

  // Different descriptions for topics vs relations
  const topicLabelDescription = 'This is the name for your Topic (e.g., "Ada Lovelace", "Paris").';
  const relationLabelDescription = 'The relationship name that describes how the connected Topics relate to each other. Use verbs like "founded", "knows", "created" or phrases like "is located in", "worked on".';
  const topicLabelDevDescription =
    "The `name` of the Entity, an implicit property per the GRC-20 spec. This should be a human-readable identifier.";
  const relationLabelDevDescription =
    "The `type` of this Relation per GRC-20 spec - defines the semantic meaning of the edge. This should be a clear, consistent verb or relationship identifier that enables meaningful graph traversals and queries.";

  const labelDescription = isRelation ? relationLabelDescription : topicLabelDescription;
  const labelDevDescription = isRelation ? relationLabelDevDescription : topicLabelDevDescription;
  
  const topicPropertiesDescription = `Add specific details to your Topic. Each detail has an Attribute and a Value.<br/><br/>For example, a 'Person' Topic might have an attribute 'Birth Year' with the value '1815'.`;
  const relationPropertiesDescription = `Add context and metadata to your Relation. Each detail describes something about the relationship itself.<br/><br/>For example, a 'founded' Relation might have 'Date' = '1976' or 'Location' = 'Garage in Los Altos'.`;
  const topicPropertiesDevDescription =
    "Define the Attributes for this Entity. Each Attribute consists of a `Key` and its `Value`.";
  const relationPropertiesDevDescription =
    "Define metadata attributes for this Relation. These properties describe characteristics of the relationship itself, not the connected Entities. Each consists of a `Key` and its `Value`.";

  const propertiesDescription = isRelation ? relationPropertiesDescription : topicPropertiesDescription;
  const propertiesDevDescription = isRelation ? relationPropertiesDevDescription : topicPropertiesDevDescription;

  return (
    <>
      <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            {isRelation ? 'Relation' : terms.topic} Inspector
            <Info
              className="w-4 h-4 text-gray-400 cursor-pointer"
              data-tooltip-id="inspector-tooltip"
              data-tooltip-content={
                isDevMode
                  ? isRelation
                    ? relationDevDescription
                    : topicDevDescription
                  : isRelation
                  ? relationDescription
                  : topicDescription
              }
            />
          </h3>
          <button onClick={onClose} className="btn btn-sm btn-ghost">
            &times;
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-medium text-gray-400">
                {isRelation ? terms.inspectorRelationLabel : terms.inspectorLabel}
              </label>
              <Info
                className="w-4 h-4 text-gray-400 cursor-pointer"
                data-tooltip-id="inspector-tooltip"
                data-tooltip-content={isDevMode ? labelDevDescription : labelDescription}
              />
            </div>
            <input
              type="text"
              className="input input-bordered w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={immediateSave}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="block text-sm font-medium text-gray-400">{terms.inspectorProperties}</span>
              <Info
                className="w-4 h-4 text-gray-400 cursor-pointer"
                data-tooltip-id="inspector-tooltip"
                data-tooltip-html={isDevMode ? propertiesDevDescription : propertiesDescription}
              />
            </div>
            <div className="space-y-2">
              {properties.map((prop) => (
                <div key={prop.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={prop.key}
                    placeholder={terms.inspectorPropertyKey}
                    onChange={(e) => handlePropertyChange(prop.id, 'key', e.target.value)}
                    onBlur={immediateSave}
                  />
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={prop.value}
                    placeholder={terms.inspectorPropertyValue}
                    onChange={(e) => handlePropertyChange(prop.id, 'value', e.target.value)}
                    onBlur={immediateSave}
                  />
                  <button onClick={() => handleRemoveProperty(prop.id)} className="btn btn-ghost btn-sm">
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <button onClick={handleAddProperty} className="btn btn-sm btn-outline mt-2 w-full">
              {terms.inspectorAddProperty}
            </button>
          </div>

          {/* Edit History Section */}
          <div>
            <button
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-400 hover:text-gray-300 transition-colors"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Clock size={16} />
              Edit History
            </button>
            
            {showHistory && (
              <div className="mt-2 max-h-48 overflow-y-auto bg-gray-800/50 rounded-lg p-3">
                {editHistoryQuery.isLoading && (
                  <div className="text-xs text-gray-500">Loading history...</div>
                )}
                
                {editHistoryQuery.error && (
                  <div className="text-xs text-red-400">Failed to load history</div>
                )}
                
                {editHistoryQuery.data && editHistoryQuery.data.length > 0 ? (
                  <div className="space-y-2">
                    {editHistoryQuery.data.map((entry, index) => {
                      const isCreation = entry.action === 'create';
                      const isLastEntry = index === editHistoryQuery.data.length - 1;
                      
                      return (
                        <div key={entry.id} className={`text-xs border-b border-gray-700 pb-2 last:border-b-0 ${isCreation ? 'bg-green-900/20 rounded px-2 py-1' : ''}`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="text-gray-300">
                                {isCreation ? (
                                  <span className="font-medium text-green-400">
                                   Created {isLastEntry ? 'this' : ''} {entry.nodeType === 'relation' ? 'relation' : entry.nodeType}
                                  </span>
                                ) : (
                                  <span>
                                    <span className="font-medium">{formatFieldName(entry.field)}</span> updated
                                  </span>
                                )}
                              </div>
                              {entry.newValue && (
                                <div className="text-gray-500 mt-1 truncate">
                                  {isCreation ? (
                                    <span className="text-green-300">
                                      Initial name: {entry.newValue.length > 40 ? `${entry.newValue.substring(0, 40)}...` : entry.newValue}
                                    </span>
                                  ) : (
                                    <span>
                                      {entry.newValue.length > 50 
                                        ? `${entry.newValue.substring(0, 50)}...` 
                                        : entry.newValue}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-gray-500 text-right ml-2">
                              <div className={isCreation ? 'text-green-400' : ''}>{formatAddress(entry.editorAddress)}</div>
                              <div className={`text-gray-600 ${isCreation ? 'text-green-500' : ''}`}>{formatTimestamp(entry.timestamp)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : editHistoryQuery.data && editHistoryQuery.data.length === 0 ? (
                  <div className="text-xs text-gray-500">No edit history available</div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <button className="btn btn-error w-full" onClick={handleDelete}>
            Delete
          </button>
        </div>
        <Tooltip id="inspector-tooltip" className="z-50 max-w-xs" />
      </aside>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        itemType={isRelation ? 'Relation' : isDevMode ? 'Entity' : 'Topic'}
        itemName={selectedNode?.data?.label || 'Untitled'}
      />
    </>
  );
};

export default memo(Inspector); 