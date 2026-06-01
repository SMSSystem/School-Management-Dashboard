import { useState } from 'react';
import { Link } from 'react-router-dom';
import InstitutionForm from '@/components/forms/InstitutionForm';
import AdminCreateUserForm from '@/components/forms/AdminCreateUserForm';

type FlowState =
  | { step: 'step1' }
  | { step: 'step2'; institutionId: string; institutionName: string }
  | { step: 'done'; institutionId: string; institutionName: string; adminName: string };

type NodeState = 'current' | 'completed' | 'pending';

function getNodeState(nodeIndex: number, flow: FlowState): NodeState {
  if (flow.step === 'step1') return nodeIndex === 0 ? 'current' : 'pending';
  if (flow.step === 'step2') return nodeIndex === 0 ? 'completed' : 'current';
  return 'completed';
}

const STEP_LABELS = ['Create Institution', 'Create Admin'];

function StepIndicator({ flow }: { flow: FlowState }) {
  return (
    <div className="flex items-start gap-3">
      {STEP_LABELS.map((label, i) => {
        const ns = getNodeState(i, flow);
        const isActive = ns !== 'pending';
        const isConnector = i < STEP_LABELS.length - 1;

        return (
          <div key={label} className="flex items-start">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-sky-500 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {ns === 'completed' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-sm font-semibold">{i + 1}</span>
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isActive
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>
            {isConnector && (
              <div
                className={`h-px w-12 mt-4 mx-3 transition-colors ${
                  getNodeState(i, flow) === 'completed'
                    ? 'bg-sky-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const OnboardInstitutionPage = () => {
  const [state, setState] = useState<FlowState>({ step: 'step1' });

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Onboard Institution
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Create a new institution and assign its admin account in two steps.
      </p>

      <div className="mt-6">
        <StepIndicator flow={state} />
      </div>

      {state.step === 'step1' && (
        <InstitutionForm
          onSuccess={(id, name) =>
            setState({ step: 'step2', institutionId: id, institutionName: name })
          }
        />
      )}

      {state.step === 'step2' && (
        <>
          <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
            Institution created — completing this step links the admin account to it.
          </p>
          <AdminCreateUserForm
            initialInstitutionId={state.institutionId}
            lockedRole="institution_admin"
            onSuccess={(adminName) =>
              setState({
                step: 'done',
                institutionId: state.institutionId,
                institutionName: state.institutionName,
                adminName,
              })
            }
          />
        </>
      )}

      {state.step === 'done' && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
                Institution onboarded successfully
              </h2>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Both records have been created in Firestore.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-emerald-100 bg-white p-4 text-sm dark:border-emerald-900 dark:bg-gray-900">
            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center">
                <span className="font-medium text-gray-600 dark:text-gray-400 sm:w-36 shrink-0">Institution</span>
                <span className="text-gray-900 dark:text-gray-100">{state.institutionName}</span>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center">
                <span className="font-medium text-gray-600 dark:text-gray-400 sm:w-36 shrink-0">Institution ID</span>
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                  {state.institutionId}
                </code>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center">
                <span className="font-medium text-gray-600 dark:text-gray-400 sm:w-36 shrink-0">Admin account</span>
                <span className="text-gray-900 dark:text-gray-100">{state.adminName}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Go to Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setState({ step: 'step1' })}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Onboard Another Institution
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardInstitutionPage;
