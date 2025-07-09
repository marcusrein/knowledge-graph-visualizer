import { memo, useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { deepEqual } from '@/lib/utils'; // We will create this utility function
import { useTerminology } from '@/lib/TerminologyContext';

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: { label?: string; properties?: any }) => void;
}

const Inspector = ({ selectedNode, onClose, onSave }: InspectorProps) => {
  const { getTerm } = useTerminology();
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Record<string, any>>({});

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


  return (
    <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">
          {isRelation ? getTerm('RELATION') : getTerm('ENTITY')} Details
        </h3>
        <button onClick={onClose} className="btn btn-sm btn-ghost">
          &times;
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Label</label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={isRelation ? getTerm('RELATION') : getTerm('ENTITY')}
            readOnly
          />
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
              />
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                value={value}
                placeholder="value"
                onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
              />
              <button onClick={() => handleRemoveProperty(key)} className="btn btn-ghost btn-sm">
                &times;
              </button>
            </div>
          ))}
        </div>

        <button onClick={handleAddProperty} className="btn btn-sm btn-outline mt-2 w-full">
          + Add Property
        </button>
      </div>

      <div className="mt-6">
        <button className="btn btn-primary w-full" disabled={!hasChanges} onClick={handleSave}>
          Save Changes
        </button>
      </div>
    </aside>
  );
};

export default memo(Inspector); 