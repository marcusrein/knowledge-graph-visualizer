import { useState, useEffect } from 'react';
import { useTerminology } from '@/lib/TerminologyContext';
import { Node } from 'reactflow';

interface InspectorProps {
  selectedNode: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: { label?: string; properties?: Record<string, string> }) => void;
  onDelete: (nodeId: string, isRelation: boolean) => void;
}

const Inspector = ({ selectedNode, onClose, onSave, onDelete }: InspectorProps) => {
  const { terms } = useTerminology();
  const [label, setLabel] = useState(selectedNode?.data?.label || '');
  const [properties, setProperties] = useState(selectedNode?.data?.properties || {});

  useEffect(() => {
    setLabel(selectedNode?.data?.label || '');
    setProperties(selectedNode?.data?.properties || {});
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isRelation = typeof selectedNode.id === 'number' || !isNaN(parseInt(selectedNode.id, 10));

  const handleSave = () => {
    onSave(selectedNode.id, { label, properties });
    onClose();
  };

  const handleDelete = () => {
    onDelete(selectedNode.id, isRelation);
    onClose();
  };

  const handlePropertyChange = (key: string, value: string) => {
    setProperties((prev: Record<string, string>) => ({ ...prev, [key]: value }));
  };

  const addProperty = () => {
    setProperties((prev: Record<string, string>) => ({ ...prev, '': '' }));
  };

  return (
    <div className="absolute top-0 right-0 h-full bg-gray-800 text-white w-96 p-4 z-10 shadow-lg flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{isRelation ? terms.relation : terms.topic} Details</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          &times;
        </button>
      </div>
      <div className="flex-grow overflow-y-auto">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-300">Properties</h3>
          {Object.entries(properties).map(([key, value]) => (
            <div key={key} className="flex items-center mt-2">
              <input
                type="text"
                value={key}
                readOnly
                className="block w-1/3 bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white"
              />
              <span className="mx-2">:</span>
              <input
                type="text"
                value={value as string}
                onChange={(e) => handlePropertyChange(key, e.target.value)}
                className="block w-2/3 bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          ))}
          <button onClick={addProperty} className="mt-2 text-blue-400 hover:text-blue-300">
            + Add Property
          </button>
        </div>
      </div>
      <div className="flex justify-end space-x-2">
        <button
          onClick={handleDelete}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
        >
          Delete
        </button>
        <button
          onClick={handleSave}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default Inspector; 