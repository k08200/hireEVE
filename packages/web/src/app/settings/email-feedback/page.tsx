"use client";

import { EmailFeedbackList } from "../../../components/email-feedback-list";

export default function EmailFeedbackPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-200">Email Feedback</h1>
      <p className="mb-6 text-sm text-gray-500">
        Review the email priority corrections EVE has captured from your feedback.
      </p>

      <EmailFeedbackList />
    </div>
  );
}
