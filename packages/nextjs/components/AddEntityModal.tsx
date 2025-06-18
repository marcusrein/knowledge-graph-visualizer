import { useState } from "react";
import { createEntityOnChain } from "~~/utils/grc20/createEntity";
import { toast } from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string | null;
  userAddress: string | undefined;
  walletClient: any;
}

const AddEntityModal = ({ isOpen, onClose, spaceId, userAddress, walletClient }: Props) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!name || !description || !spaceId || !userAddress) return;
    try {
      setLoading(true);
      await createEntityOnChain({ name, description, userAddress, walletClient, spaceId });
      // reload after short delay to allow toast to show
      setTimeout(() => window.location.reload(), 1000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg mb-4">Add New Knowledge Category</h3>
        <div className="space-y-4">
          <input
            className="input input-bordered w-full"
            placeholder="New Knowledge Category"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <textarea
            className="textarea textarea-bordered w-full h-24"
            placeholder="Share your knowledge!"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name || !description || loading} onClick={handlePublish}>
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                &nbsp;Publishing…
              </>
            ) : (
              "Publish to GRC-20"
            )}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
};

export default AddEntityModal; 