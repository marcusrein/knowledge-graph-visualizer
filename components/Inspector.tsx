import { useState, useEffect, memo } from 'react';
import { useTerminology } from '@/lib/TerminologyContext';
import { Node } from 'reactflow';
import { Info } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { deepEqual } from '@/lib/utils';

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

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      const propsObject = safeParseProperties(selectedNode.data.properties);
      const propsArray = Object.entries(propsObject).map(([key, value], index) => ({
        id: index,
        key,
        value: String(value),
      }));
      setProperties(propsArray);
      setNextId(propsArray.length);
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isRelation = /^\d+$/.test(selectedNode.id);

  const hasChanges = () => {
    const originalProperties = safeParseProperties(selectedNode.data.properties);
    const currentProperties = properties.reduce((acc, prop) => {
      if (prop.key) acc[prop.key] = prop.value;
      return acc;
    }, {} as Record<string, string>);
    return label !== selectedNode.data.label || !deepEqual(originalProperties, currentProperties);
  };

  const handleSave = () => {
    const propertiesObject = properties.reduce((acc, prop) => {
      if (prop.key) {
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

  const handleDelete = () => {
    if (selectedNode) {
      onDelete(selectedNode.id, isRelation);
    }
  };

  const topicDescription =
    'Topics are the core concepts or objects in your knowledge graph. They can be anything—ideas, projects, or people.';
  const relationDescription =
    "A Connection describes how two topics are related. For example, 'Ada Lovelace' (Topic) 'wrote' (Relation) 'the first algorithm' (Topic).";
  const topicDevDescription =
    "An Entity is a unique identifier representing a person, place, or idea. It's the 'node' in the graph, defined by its values.";
  const relationDevDescription =
    "A Relation is a directed edge between two Entities, defined by its `type`. It can also have its own values, making it a property graph.";

  const labelDescription = 'This is the name for your Topic (e.g., "Ada Lovelace", "Paris").';
  const labelDevDescription =
    "The `name` of the Entity, an implicit property per the GRC-20 spec. This should be a human-readable identifier.";
  
  const propertiesDescription = `Add specific details to your Topic. Each detail has an Attribute and a Value.<br/><br/>For example, a 'Person' Topic might have an attribute 'Birth Year' with the value '1815'.`;
  const propertiesDevDescription =
    "Define the `values` for this Entity. Each value consists of a `property` (a UUID reference to a Property definition) and its literal `value`.";

  return (
    <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          {isRelation ? terms.relation : terms.topic} Inspector
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
            <label className="block text-sm font-medium text-gray-400">{terms.inspectorLabel}</label>
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
                />
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={prop.value}
                  placeholder={terms.inspectorPropertyValue}
                  onChange={(e) => handlePropertyChange(prop.id, 'value', e.target.value)}
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