/**
 * components/tour/useSpotlightTour.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook that manages the spotlight tour state: whether it should run, current
 * step, and navigation between steps.
 *
 * Reads completion status from settings on mount so the tour only runs once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { spotlightTourSteps } from './tour-steps';

export function useSpotlightTour() {
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [ready, setReady] = useState(false);

  const totalSteps = spotlightTourSteps.length;
  const step = spotlightTourSteps[currentStep];

  /** Check whether the tour has already been completed. */
  const checkTourStatus = useCallback(async () => {
    try {
      const s = await window.electron.ipc.invoke<{
        spotlightTourCompleted?: boolean;
      }>('settings:get');
      if (s?.spotlightTourCompleted !== true) {
        setShowTour(true);
      }
    } catch {
      // If settings fails, skip the tour gracefully.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void checkTourStatus();
  }, [checkTourStatus]);

  const markCompleted = useCallback(async () => {
    try {
      await window.electron.ipc.invoke('settings:save', {
        spotlightTourCompleted: true,
      });
    } catch {
      // Best effort — don't block the user.
    }
  }, []);

  const closeTour = useCallback(() => {
    void markCompleted();
    setShowTour(false);
  }, [markCompleted]);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      closeTour();
    }
  }, [currentStep, totalSteps, closeTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    void markCompleted();
    setShowTour(false);
  }, [markCompleted]);

  // Keyboard navigation: Escape to skip, ArrowRight/Enter for next, ArrowLeft for prev
  useEffect(() => {
    if (!showTour) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showTour, nextStep, prevStep, skipTour]);

  // Ensure the user is on /tasks so the tour targets exist
  useEffect(() => {
    if (showTour && !window.location.pathname.startsWith('/tasks')) {
      navigate('/tasks', { replace: true });
    }
  }, [showTour, navigate]);

  return {
    showTour,
    ready,
    step,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    closeTour,
    skipTour,
  };
}
