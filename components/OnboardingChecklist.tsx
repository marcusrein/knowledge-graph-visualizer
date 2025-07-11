import React from 'react';
import { X } from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  isCompleted: boolean;
}

interface OnboardingChecklistProps {
  steps: OnboardingStep[];
  onDismiss: () => void;
}

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ steps, onDismiss }) => {
  const completedCount = steps.filter(step => step.isCompleted).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-gray-700 text-white rounded-lg shadow-lg p-4 z-20">
      <div className="flex justify-between items-start">
        <h3 className="font-bold mb-2 text-md">Getting Started</h3>
        <button 
          onClick={onDismiss} 
          className="text-gray-400 hover:text-white focus:ring-2 focus:ring-blue-300 transition-all duration-200 rounded p-1"
          tabIndex={0}
          aria-label="Dismiss onboarding checklist"
        >
          <X size={20} />
        </button>
      </div>
      <p className="text-xs text-gray-300 mb-3">Complete these steps to learn the basics.</p>
      
      {/* Progress Bar */}
      <div className="w-full bg-gray-600 rounded-full h-1.5 mb-4">
        <div 
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Steps */}
      <ul className="space-y-2">
        {steps.map(step => (
          <li key={step.id} className="flex items-center text-sm">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center mr-3 ${step.isCompleted ? 'bg-blue-500' : 'bg-gray-600'}`}>
              {step.isCompleted && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={step.isCompleted ? 'line-through text-gray-400' : ''}>
              {step.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OnboardingChecklist; 