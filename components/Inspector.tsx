import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useTerminology } from '@/lib/TerminologyContext';
import { Node } from 'reactflow';
import { Info, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import DeleteConfirmModal from './DeleteConfirmModal';
import { useResizable } from '@/lib/useResizable';
import { useQuery } from '@tanstack/react-query';

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

const safeParseProperties = (value: unknown): Record<string, string> => {
  try {
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
};

const Inspector = ({ selectedNode, onClose, onSave, onDelete }: InspectorProps) => {
  const { address } = useAccount();
  const { terms, isDevMode } = useTerminology();
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Resize functionality
  const { size: inspectorWidth, isResizing, handleMouseDown, handleTouchStart } = useResizable({
    initialSize: 320, // 320px = w-80
    minSize: 280,
    maxSize: 600,
    storageKey: 'inspector-width',
    direction: 'horizontal',
  });

  // Fetch edit history for the selected node
  const editHistoryQuery = useQuery({
    queryKey: ['editHistory', selectedNode?.id],
    queryFn: async () => {
      if (!selectedNode?.id) return [];
      const res = await fetch(`/api/edit-history?nodeId=${selectedNode.id}`);
      if (!res.ok) throw new Error('Failed to fetch edit history');
      return res.json();
    },
    enabled: !!selectedNode?.id && showHistory,
  });

  // Initialize state when selectedNode changes
  useEffect(() => {
    if (!selectedNode) return;

    setLabel(selectedNode.data?.label || '');
    
    const nodeProperties = safeParseProperties(selectedNode.data?.properties);
    const propsArray = Object.entries(nodeProperties).map(([key, value], index) => ({
      id: index,
      key,
      value: String(value),
    }));
    setProperties(propsArray);

    if (selectedNode.type === 'group') {
      setVisibility(selectedNode.data.visibility ?? 'public');
    }
  }, [selectedNode]);

  // Helper function to format edit history entries
  const formatEditHistoryEntry = (entry: {
    id: number;
    action: string;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    editorAddress: string | null;
    timestamp: string;
  }) => {
    const formatAddress = (addr: string | null) => {
      if (!addr) return 'Unknown';
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const formatTimestamp = (timestamp: string) => {
      try {
        return new Date(timestamp).toLocaleString();
      } catch {
        return timestamp;
      }
    };

    const getActionDescription = () => {
      switch (entry.action) {
        case 'create':
          return `Created with name "${entry.newValue}"`;
        case 'update':
          if (entry.field === 'label') {
            return `Changed name from "${entry.oldValue}" to "${entry.newValue}"`;
          }
          if (entry.field === 'visibility') {
            return `Changed visibility from ${entry.oldValue} to ${entry.newValue}`;
          }
          if (entry.field === 'properties') {
            return 'Updated properties';
          }
          if (entry.field === 'parentId') {
            const oldParent = entry.oldValue ? `moved from space ${entry.oldValue.slice(0, 8)}...` : 'moved from global';
            const newParent = entry.newValue ? `to space ${entry.newValue.slice(0, 8)}...` : 'to global';
            return `${oldParent} ${newParent}`;
          }
          return `Updated ${entry.field}`;
        case 'delete':
          return 'Deleted';
        default:
          return entry.action;
      }
    };

    return {
      ...entry,
      actionDescription: getActionDescription(),
      editorDisplay: formatAddress(entry.editorAddress),
      timestampDisplay: formatTimestamp(entry.timestamp),
    };
  };

  const isSpace = selectedNode?.type === 'group';
  const isRelation = selectedNode?.type === 'relation';

  const spaceLabelDescription = 'This is the name for your Space (e.g., "Work Projects", "Research Notes"). Spaces help organize related Topics.';

  if (!selectedNode) return null;

  /* ---------- SPACE INSPECTOR ---------- */
  if (isSpace) {
    const canEditVisibility = address && selectedNode?.data?.owner && address.toLowerCase() === selectedNode.data.owner.toLowerCase();

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
        <aside 
          className="absolute top-0 right-0 h-full bg-base-200 shadow-lg z-10 flex flex-col"
          style={{ width: `${inspectorWidth}px` }}
        >
          {/* Resize handle */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 bg-gray-600/50 hover:bg-blue-500 transition-colors cursor-ew-resize group ${
              isResizing ? 'bg-blue-500' : ''
            }`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Visual indicator */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-white/30 group-hover:bg-white/60 transition-colors rounded-full" />
          </div>

          <div className="p-4 flex flex-col h-full">
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
                    {editHistoryQuery.isLoading ? (
                      <div className="text-xs text-gray-500">Loading history...</div>
                    ) : editHistoryQuery.error ? (
                      <div className="text-xs text-red-400">Failed to load history</div>
                    ) : editHistoryQuery.data && editHistoryQuery.data.length > 0 ? (
                      <div className="space-y-2">
                        {editHistoryQuery.data.map((entry: any) => {
                          const formatted = formatEditHistoryEntry(entry);
                          return (
                            <div key={entry.id} className="border-b border-gray-700 last:border-b-0 pb-2 last:pb-0">
                              <div className="text-xs text-gray-300 font-medium">
                                {formatted.actionDescription}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {formatted.editorDisplay} • {formatted.timestampDisplay}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">No edit history yet</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <button className="btn btn-error w-full" onClick={() => setShowDeleteModal(true)}>Delete</button>
            </div>
          </div>
          <Tooltip id="inspector-tooltip" className="z-50 max-w-xs" />
        </aside>

        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            if (selectedNode) {
              onDelete(selectedNode.id, false);
              setShowDeleteModal(false);
            }
          }}
          itemType="Space"
          itemName={selectedNode?.data?.label || 'Untitled'}
        />
      </>
    );
  }

  /* ---------- TOPIC/RELATION INSPECTOR ---------- */
  const topicLabelDescription = 'This is the name for your Topic (e.g., "Ada Lovelace", "Paris").';
  const relationLabelDescription = 'The relationship name that describes how the connected Topics relate to each other. Use verbs like "founded", "knows", "created" or phrases like "is located in", "worked on".';
  const topicLabelDevDescription = "The `name` of the Entity, an implicit property per the GRC-20 spec. This should be a human-readable identifier.";
  const relationLabelDevDescription = "The `type` of this Relation per GRC-20 spec - defines the semantic meaning of the edge. This should be a clear, consistent verb or relationship identifier that enables meaningful graph traversals and queries.";

  const labelDescription = isRelation ? relationLabelDescription : topicLabelDescription;
  const labelDevDescription = isRelation ? relationLabelDevDescription : topicLabelDevDescription;
  
  const topicPropertiesDescription = `Add specific details to your Topic. Each detail has an Attribute and a Value.<br/><br/>For example, a 'Person' Topic might have an attribute 'Birth Year' with the value '1815'.`;
  const relationPropertiesDescription = `Add context and metadata to your Relation. Each detail describes something about the relationship itself.<br/><br/>For example, a 'founded' Relation might have 'Date' = '1976' or 'Location' = 'Garage in Los Altos'.`;
  const topicPropertiesDevDescription = "Define the Attributes for this Entity. Each Attribute consists of a `Key` and its `Value`.";
  const relationPropertiesDevDescription = "Define metadata attributes for this Relation. These properties describe characteristics of the relationship itself, not the connected Entities. Each consists of a `Key` and its `Value`.";

  const propertiesDescription = isRelation ? relationPropertiesDescription : topicPropertiesDescription;
  const propertiesDevDescription = isRelation ? relationPropertiesDevDescription : topicPropertiesDevDescription;

  return (
    <>
      <aside 
        className="absolute top-0 right-0 h-full bg-base-200 shadow-lg z-10 flex flex-col"
        style={{ width: `${inspectorWidth}px` }}
      >
        {/* Resize handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 bg-gray-600/50 hover:bg-blue-500 transition-colors cursor-ew-resize group ${
            isResizing ? 'bg-blue-500' : ''
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Visual indicator */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-white/30 group-hover:bg-white/60 transition-colors rounded-full" />
        </div>

        <div className="p-4 flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              {isRelation ? 'Relation' : terms.topic} Inspector
              <Info
                className="w-4 h-4 text-gray-400 cursor-pointer"
                data-tooltip-id="inspector-tooltip"
                data-tooltip-content={
                  isDevMode
                    ? isRelation
                      ? relationLabelDevDescription
                      : topicLabelDevDescription
                    : isRelation
                    ? relationLabelDescription
                    : topicLabelDescription
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
                onBlur={() => {
                  if (selectedNode) {
                    onSave(selectedNode.id, { label, properties: properties.reduce((acc, prop) => {
                      if (prop.key && prop.value) acc[prop.key] = prop.value;
                      return acc;
                    }, {} as Record<string, string>) });
                  }
                }}
              />
            </div>

            {/* Properties section */}
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
                      onChange={(e) => {
                        setProperties(prev => prev.map(p => 
                          p.id === prop.id ? { ...p, key: e.target.value } : p
                        ));
                      }}
                      onBlur={() => {
                        if (selectedNode) {
                          onSave(selectedNode.id, { label, properties: properties.reduce((acc, prop) => {
                            if (prop.key && prop.value) acc[prop.key] = prop.value;
                            return acc;
                          }, {} as Record<string, string>) });
                        }
                      }}
                    />
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={prop.value}
                      placeholder={terms.inspectorPropertyValue}
                      onChange={(e) => {
                        setProperties(prev => prev.map(p => 
                          p.id === prop.id ? { ...p, value: e.target.value } : p
                        ));
                      }}
                      onBlur={() => {
                        if (selectedNode) {
                          onSave(selectedNode.id, { label, properties: properties.reduce((acc, prop) => {
                            if (prop.key && prop.value) acc[prop.key] = prop.value;
                          return acc;
                          }, {} as Record<string, string>) });
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        setProperties(prev => prev.filter(p => p.id !== prop.id));
                      }}
                      className="btn btn-ghost btn-sm"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => {
                  setProperties(prev => [...prev, { id: Date.now(), key: '', value: '' }]);
                }}
                className="btn btn-sm btn-outline mt-2 w-full"
              >
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
                  <div className="text-xs text-gray-500">Edit history would appear here</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button 
              className="btn btn-error w-full" 
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
          </div>
        </div>
        <Tooltip id="inspector-tooltip" className="z-50 max-w-xs" />
      </aside>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => {
          if (selectedNode) {
            const isRelation = /^\d+$/.test(selectedNode.id);
            onDelete(selectedNode.id, isRelation);
            setShowDeleteModal(false);
          }
        }}
        itemType={isRelation ? 'Relation' : isDevMode ? 'Entity' : 'Topic'}
        itemName={selectedNode?.data?.label || 'Untitled'}
      />
    </>
  );
};

export default Inspector; 