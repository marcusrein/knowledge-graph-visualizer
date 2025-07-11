import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useTerminology } from '@/lib/TerminologyContext';

interface OnboardingStep {
  id: string;
  title: string;
  isCompleted: boolean;
  description?: string;
}

interface OnboardingChecklistProps {
  steps: OnboardingStep[];
  onDismiss: () => void;
  onTryAgain: () => void;
}

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ 
  steps, 
  onDismiss,
  onTryAgain
}) => {
  const { terms } = useTerminology();
  const completedCount = steps.filter(step => step.isCompleted).length;
  const progress = (completedCount / steps.length) * 100;
  const allCompleted = completedCount === steps.length;
  const hasProgress = completedCount > 0;

  // Generate dynamic steps with proper terminology
  const dynamicSteps = steps.map(step => {
    let title = step.title;
    let description = step.description || '';
    
    // Replace Topic with the appropriate term and add purple styling ONLY in titles
    // Handle plural first to avoid partial replacement
    title = title.replace(/Topics/g, `<span class="text-purple-500">${terms.topics}</span>`);
    title = title.replace(/Topic/g, `<span class="text-purple-500">${terms.topic}</span>`);
    
    // Replace terminology in descriptions WITHOUT purple styling
    // Handle plural first to avoid partial replacement
    description = description.replace(/Topics/g, terms.topics);
    description = description.replace(/Topic/g, terms.topic);
    
    return {
      ...step,
      title,
      description
    };
  });

  return (
    <div className="fixed top-20 right-[63px] w-80 bg-gray-700 text-white rounded-lg shadow-lg p-4 z-10 border border-gray-600">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-md">
          {allCompleted ? "🎉 Welcome Complete!" : "Getting Started"}
        </h3>
        <button 
          onClick={onDismiss} 
          className="text-gray-400 hover:text-white focus:ring-2 focus:ring-blue-300 transition-all duration-200 rounded p-1"
          tabIndex={0}
          aria-label="Dismiss onboarding checklist"
        >
          <X size={20} />
        </button>
      </div>
      
      {allCompleted ? (
        <p className="text-xs text-green-300 mb-3">
          Great job! You&apos;ve learned the basics of building knowledge graphs.
        </p>
      ) : (
        <p className="text-xs text-gray-300 mb-3">
          Complete these steps to learn the basics ({completedCount}/{steps.length} done).
        </p>
      )}
      
      {/* Progress Bar */}
      <div className="w-full bg-gray-600 rounded-full h-2 mb-4">
        <div 
          className={`h-2 rounded-full transition-all duration-500 ${
            allCompleted ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Steps */}
      <ul className="space-y-3 mb-4">
        {dynamicSteps.map((step, index) => (
          <li key={step.id} className="flex items-start text-sm">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
              step.isCompleted ? 'bg-green-500' : 'bg-gray-600'
            }`}>
              {step.isCompleted ? (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-xs text-gray-300 font-semibold">{index + 1}</span>
              )}
            </div>
            <div className="flex-1">
              <span 
                className={`block ${step.isCompleted ? 'line-through text-gray-400' : 'text-white'}`}
                dangerouslySetInnerHTML={{ __html: step.title }}
              />
              {step.description && !step.isCompleted && (
                <span 
                  className="text-xs text-gray-400 mt-0.5 block"
                  dangerouslySetInnerHTML={{ __html: step.description }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Try Again Button - Only show if user has made some progress */}
      {hasProgress && (
        <div className="border-t border-gray-600 pt-3">
          <button
            onClick={onTryAgain}
            className="flex items-center justify-center gap-2 w-full bg-gray-600 hover:bg-gray-500 focus:bg-gray-500 focus:ring-2 focus:ring-blue-300 text-white text-sm font-medium py-2 px-3 rounded transition-all duration-200"
            tabIndex={0}
            aria-label="Reset checklist progress and try again"
          >
            <RotateCcw size={16} />
            Try Again
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Reset your progress and start the checklist over
          </p>
        </div>
      )}
    </div>
  );
};

export default OnboardingChecklist; 