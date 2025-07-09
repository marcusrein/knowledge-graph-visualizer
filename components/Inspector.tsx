import { memo, useState, useEffect } from 'react';
import { Node } from 'reactflow';

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: { label?: string; properties?: any }) => void;
}

const Inspector = ({ selectedNode, onClose, onSave }: InspectorProps) => {
  const [label, setLabel] = useState('');
  const [properties, setProperties] = useState<Record<string, any>>({});

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      setProperties(selectedNode.data.properties || {});
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isRelation = /^\d+$/.test(selectedNode.id);
  const hasChanges = label !== selectedNode.data.label;

  const handleSave = () => {
    onSave(selectedNode.id, {
      label,
      properties,
    });
  };

  return (
    <aside className="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-lg z-10 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">{isRelation ? 'Relation Details' : 'Entity Details'}</h3>
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
            value={isRelation ? 'Relation' : 'Entity'}
            readOnly
          />
        </div>

        <div className="divider">Properties</div>

        <div className="text-sm text-gray-500 text-center py-4">
          {Object.keys(properties).length > 0
            ? JSON.stringify(properties, null, 2)
            : 'No properties yet.'}
        </div>
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