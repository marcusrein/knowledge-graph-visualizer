import { memo, useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Info } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { deepEqual } from '@/lib/utils'; // We will create this utility function
import { useTerminology } from '@/lib/TerminologyContext';

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: { label?: string; properties?: Record<string, string> }) => void;
  onDelete: (nodeId: string, isRelation: boolean) => void;
}

const Inspector = ({ selectedNode, onClose, onSave, onDelete }: InspectorProps) => {
  const { getTerm } = useTerminology();
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      setProperties(JSON.parse(selectedNode.data.properties || '{}'));
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isRelation = /^\d+$/.test(selectedNode.id);
  const hasChanges =
    label !== selectedNode.data.label ||
    !deepEqual(properties, JSON.parse(selectedNode.data.properties || '{}'));

  const handleSave = () => {
    onSave(selectedNode.id, {
      label,
      properties,
    });
  };

  const handlePropertyChange = (index: number, part: 'key' | 'value', value: string) => {
    setProperties(currentProperties => {
      const entries = Object.entries(currentProperties);
      const [currentKey, currentValue] = entries[index];

      if (part === 'key') {
        entries[index] = [value, currentValue];
      } else {
        entries[index] = [currentKey, value];
      }
      
      return Object.fromEntries(entries);
    });
  };

  const handleAddProperty = () => {
    const newKey = `newProperty${Object.keys(properties).length + 1}`;
    setProperties({ ...properties, [newKey]: '' });
  };

  const handleRemoveProperty = (key: string) => {
    const newProperties = { ...properties };
    delete newProperties[key];
    setProperties(newProperties);
  };

  const handleDelete = () => {
    if (selectedNode) {
      onDelete(selectedNode.id, isRelation);
      onClose(); // Close inspector after deletion
    }
  };

  const entityDescription = "In a knowledge graph, a Topic represents an 'entity'—a unique person, place, idea, or concept. Think of it as a noun. You can connect Topics to show their relationships.";
  const relationDescription = "A Relation is the connection or 'edge' between two Topics. It describes how they're related, acting like a verb. For example, 'Ada Lovelace' (Topic) 'wrote' (Relation) 'the first algorithm' (Topic).";

  const commonRelations = [
    'connected to',
    'is a',
    'has a',
    'part of',
    'works at',
    'lives in',
    'born in',
    'wrote',
    'created',
    'owns'
  ];

  return (
    <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          {isRelation ? 'Relation' : 'Topic'} Inspector
          <Info
            className="w-4 h-4 text-gray-400 cursor-pointer"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content={isRelation ? relationDescription : entityDescription}
          />
        </h3>
        <button onClick={onClose} className="btn btn-sm btn-ghost">
          &times;
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto">
        <div>
          <label
            className="block text-sm font-medium text-gray-400 mb-1"
            data-tooltip-id="inspector-tooltip"
            data-tooltip-content={isRelation ? "Describe the relationship between the two Topics. Examples: 'is a friend of', 'works at', 'is located in'. Keep it descriptive!" : "Give your Topic a clear, concise name. This label is how you'll see and identify this piece of knowledge on the knowledge graph."}
          >
            {isRelation ? "How Topics Relate" : "Label"}
          </label>
          {isRelation ? (
            <select
              className="select select-bordered w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            >
              {commonRelations.map(rel => (
                <option key={rel} value={rel}>{rel}</option>
              ))}
              {!commonRelations.includes(label) && (
                <option key={label} value={label}>{label}</option>
              )}
            </select>
          ) : (
            <input
              type="text"
              className="input input-bordered w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </div>

        <div className="divider">{getTerm('PROPERTIES')}</div>

        <div className="space-y-2">
          {Object.entries(properties).map(([key, value], index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                value={key}
                placeholder="key"
                onChange={(e) => handlePropertyChange(index, 'key', e.target.value)}
                data-tooltip-id="inspector-tooltip"
                data-tooltip-content={`Add a custom property to the '${label}' ${isRelation ? 'Relation' : 'Topic'}. The 'key' is the name of the data field, like 'Date of Birth' or 'Website'.`}
              />
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                value={value}
                placeholder="value"
                onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
                data-tooltip-id="inspector-tooltip"
                data-tooltip-content={`Provide a value for the custom property. For a 'Website' key, this would be the URL.`}
              />
              <button onClick={() => handleRemoveProperty(key)} className="btn btn-ghost btn-sm">
                &times;
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddProperty}
          className="btn btn-sm btn-outline mt-2 w-full"
          data-tooltip-id="inspector-tooltip"
          data-tooltip-content={`Enrich your '${label}' ${isRelation ? 'Relation' : 'Topic'} with extra details. Each property is a key-value pair, adding more semantic meaning and context.`}
        >
          + Add Property
        </button>
      </div>

      <div className="mt-6 space-y-2">
        <button className="btn btn-primary w-full" disabled={!hasChanges} onClick={handleSave}>
          Save Changes
        </button>
        <button className="btn btn-error btn-outline w-full" onClick={handleDelete}>
          Delete
        </button>
      </div>
      <Tooltip id="inspector-tooltip" className="z-50" />
    </aside>
  );
};

export default memo(Inspector); 