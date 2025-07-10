import { memo, useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Info } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { deepEqual } from '@/lib/utils'; // We will create this utility function

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: { label?: string; properties?: Record<string, string> }) => void;
  onDelete: (nodeId: string, isRelation: boolean) => void;
}

interface Property {
  id: number;
  key: string;
  value: string;
}

const Inspector = ({ selectedNode, onClose, onSave, onDelete }: InspectorProps) => {
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [nextId, setNextId] = useState(0);
  const [isCustomRelation, setIsCustomRelation] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      const propsObject = JSON.parse(selectedNode.data.properties || '{}');
      const propsArray = Object.entries(propsObject).map(([key, value], index) => ({
        id: index,
        key,
        value: String(value)
      }));
      setProperties(propsArray);
      setNextId(propsArray.length);

      const isRelation = /^\d+$/.test(selectedNode.id);
      if (isRelation && !commonRelations.includes(selectedNode.data.label)) {
        setIsCustomRelation(true);
      } else {
        setIsCustomRelation(false);
      }
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isRelation = /^\d+$/.test(selectedNode.id);

  const hasChanges = () => {
    const originalProperties = JSON.parse(selectedNode.data.properties || '{}');
    const currentProperties = properties.reduce((acc, prop) => {
      if (prop.key) acc[prop.key] = prop.value;
      return acc;
    }, {} as Record<string, string>);
    return label !== selectedNode.data.label || !deepEqual(originalProperties, currentProperties);
  }

  const handleSave = () => {
    const propertiesObject = properties.reduce((acc, prop) => {
      if (prop.key) { // Ignore properties with empty keys
        acc[prop.key] = prop.value;
      }
      return acc;
    }, {} as Record<string, string>);
    onSave(selectedNode.id, {
      label,
      properties: propertiesObject,
    });
  };

  const handlePropertyChange = (id: number, part: 'key' | 'value', value: string) => {
    setProperties(currentProperties =>
      currentProperties.map(p => p.id === id ? { ...p, [part]: value } : p)
    );
  };

  const handleAddProperty = () => {
    setProperties([...properties, { id: nextId, key: '', value: '' }]);
    setNextId(nextId + 1);
  };

  const handleRemoveProperty = (id: number) => {
    setProperties(properties.filter(p => p.id !== id));
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
    'created',
    'owns',
    'is a type of',
    'is a subclass of',
    'is a superclass of',
    'comes from',

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
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-sm font-medium text-gray-400">
              {isRelation ? "How Topics Relate" : "Label"}
            </label>
            <Info
              className="w-4 h-4 text-gray-400 cursor-pointer"
              data-tooltip-id="inspector-tooltip"
              data-tooltip-content={isRelation ? "This is how the two Topics are related." : "Think of this as the 'noun' or proper name for your Topic (e.g., 'Ada Lovelace', 'Paris', 'Computer Science')."}
            />
          </div>
          {isRelation ? (
            !isCustomRelation ? (
              <select
                className="select select-bordered w-full"
                value={label}
                onChange={(e) => {
                  if (e.target.value === 'add_new') {
                    setIsCustomRelation(true);
                    setLabel('');
                  } else {
                    setLabel(e.target.value);
                  }
                }}
              >
                {commonRelations.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
                {!commonRelations.includes(label) && <option value={label}>{label}</option>}
                <option value="add_new">+ Add new relation</option>
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={label}
                  placeholder="Enter custom relation"
                  onChange={(e) => setLabel(e.target.value)}
                />
                <button
                  className="btn btn-xs btn-ghost mt-1 text-gray-500"
                  onClick={() => {
                    setIsCustomRelation(false);
                    setLabel(commonRelations[0]);
                  }}
                >
                  Cancel
                </button>
              </div>
            )
          ) : (
            <input
              type="text"
              className="input input-bordered w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="block text-sm font-medium text-gray-400">Details</span>
            <Info
              className="w-4 h-4 text-gray-400 cursor-pointer"
              data-tooltip-id="inspector-tooltip"
              data-tooltip-html={
                isRelation
                  ? "Add properties to describe the connection itself. This is useful for capturing details that don't fit in the label.<br/><br/>For example, for a <b>'works at'</b> relation, you could add details like:<br/>- Attribute: 'Role', Value: 'Engineer'<br/>- Attribute: 'Start Date', Value: '2023-01-15'<br/><br/>This follows the GRC20 spec for 'Relation Entities'."
                  : `Add specific details to your <i>Topic</i>. Each detail has an <i>Attribute</i> and a <i>Value</i>.<br/><br/>For example, a 'Person' Topic might have an attribute 'Born' with the value '1815'.`
              }
            />
          </div>
          <div className="space-y-2">
            {properties.map((prop) => (
              <div key={prop.id} className="flex items-center gap-2">
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={prop.key}
                  placeholder={isRelation ? "Attribute" : "Attribute"}
                  onChange={(e) => handlePropertyChange(prop.id, 'key', e.target.value)}
                />
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={prop.value}
                  placeholder={isRelation ? "Value" : "Value"}
                  onChange={(e) => handlePropertyChange(prop.id, 'value', e.target.value)}
                />
                <button onClick={() => handleRemoveProperty(prop.id)} className="btn btn-ghost btn-sm">
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleAddProperty}
          className="btn btn-sm btn-outline mt-2 w-full"
        >
          + Add Details
        </button>
      </div>

      <div className="mt-6 space-y-2">
        <button className="btn btn-primary w-full" disabled={!hasChanges()} onClick={handleSave}>
          Save Changes
        </button>
        <button className="btn btn-error btn-outline w-full" onClick={handleDelete}>
          Delete
        </button>
      </div>
      <Tooltip id="inspector-tooltip" className="z-50 max-w-xs" />
    </aside>
  );
};

export default memo(Inspector); 