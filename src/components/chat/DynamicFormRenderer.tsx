"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Check, Users, Baby, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type {
  DynamicForm,
  DynamicQuestion,
  TravelerGroup,
} from "@/lib/dynamic-inputs";

interface DynamicFormRendererProps {
  form: DynamicForm;
  onSubmit: (
    answers: Record<
      string,
      string | number | boolean | string[] | TravelerGroup
    >
  ) => void;
  onSkip?: () => void;
}

export function DynamicFormRenderer({
  form,
  onSubmit,
  onSkip,
}: DynamicFormRendererProps) {
  const [answers, setAnswers] = useState<
    Record<string, string | number | boolean | string[] | TravelerGroup>
  >({});

  const updateAnswer = (
    questionId: string,
    value: string | number | boolean | string[] | TravelerGroup
  ) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    onSubmit(answers);
  };

  const isComplete = form.questions
    .filter((q) => q.required)
    .every((q) => {
      const answer = answers[q.id];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer !== undefined && answer !== "";
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden"
    >
      {form.title && (
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {form.title}
          </h3>
          {form.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {form.description}
            </p>
          )}
        </div>
      )}

      <div className="p-6 space-y-6">
        {form.questions.map((question) => (
          <QuestionRenderer
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => updateAnswer(question.id, value)}
          />
        ))}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
        {onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!isComplete}
        >
          Continue Planning
        </Button>
      </div>
    </motion.div>
  );
}

interface QuestionRendererProps {
  question: DynamicQuestion;
  value: string | number | boolean | string[] | TravelerGroup | undefined;
  onChange: (
    value: string | number | boolean | string[] | TravelerGroup
  ) => void;
}

function QuestionRenderer({
  question,
  value,
  onChange,
}: QuestionRendererProps) {
  switch (question.type) {
    case "select":
      return (
        <SelectInput
          question={question}
          value={value as string}
          onChange={onChange}
        />
      );
    case "multiselect":
      return (
        <MultiSelectInput
          question={question}
          value={value as string[]}
          onChange={onChange}
        />
      );
    case "daterange":
      return (
        <DateRangeInput
          question={question}
          value={value as string}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <NumberInput
          question={question}
          value={value as number}
          onChange={onChange}
        />
      );
    case "traveler-group":
      return (
        <TravelerGroupInput
          question={question}
          value={value as TravelerGroup}
          onChange={onChange}
        />
      );
    case "text":
    default:
      return (
        <TextInput
          question={question}
          value={value as string}
          onChange={onChange}
        />
      );
  }
}

function SelectInput({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {question.options?.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left",
              value === option.value
                ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 text-gray-700 dark:text-gray-300"
            )}
          >
            {option.icon && <span className="text-lg">{option.icon}</span>}
            <span className="text-sm font-medium">{option.label}</span>
            {value === option.value && (
              <Check className="w-4 h-4 ml-auto text-purple-500" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelectInput({
  question,
  value = [],
  onChange,
}: {
  question: DynamicQuestion;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}) {
  const selectedValues = value || [];

  const toggleOption = (optionValue: string) => {
    if (selectedValues.includes(optionValue)) {
      onChange(selectedValues.filter((v) => v !== optionValue));
    } else {
      onChange([...selectedValues, optionValue]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {question.options?.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => toggleOption(option.value)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full border-2 transition-all duration-200",
                isSelected
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 text-gray-700 dark:text-gray-300"
              )}
            >
              {option.icon && <span>{option.icon}</span>}
              <span className="text-sm">{option.label}</span>
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateRangeInput({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setStartDate(newStart);
    if (newStart && endDate) {
      onChange(`${newStart} to ${endDate}`);
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    setEndDate(newEnd);
    if (startDate && newEnd) {
      onChange(`${startDate} to ${newEnd}`);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={startDate}
            onChange={handleStartChange}
            min={new Date().toISOString().split("T")[0]}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <span className="text-gray-400">to</span>
        <div className="flex-1 relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={endDate}
            onChange={handleEndChange}
            min={startDate || new Date().toISOString().split("T")[0]}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>
    </div>
  );
}

function NumberInput({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const currentValue = value ?? question.defaultValue ?? question.min ?? 1;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          onClick={() =>
            onChange(Math.max(question.min ?? 1, (currentValue as number) - 1))
          }
          className="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors"
        >
          -
        </button>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 w-12 text-center">
          {currentValue as number}
        </span>
        <button
          onClick={() =>
            onChange(Math.min(question.max ?? 20, (currentValue as number) + 1))
          }
          className="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TextInput({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
  );
}

function TravelerGroupInput({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: TravelerGroup | undefined;
  onChange: (value: TravelerGroup) => void;
}) {
  const defaultValue = (question.defaultValue as TravelerGroup) || {
    adults: 2,
    children: 0,
    childrenAges: [],
  };
  const currentValue = value || defaultValue;

  const updateGroup = (updates: Partial<TravelerGroup>) => {
    const newValue = { ...currentValue, ...updates };

    // Adjust childrenAges array length when children count changes
    if (updates.children !== undefined) {
      const currentAges = currentValue.childrenAges || [];
      if (updates.children > currentAges.length) {
        // Add default ages for new children
        newValue.childrenAges = [
          ...currentAges,
          ...Array(updates.children - currentAges.length).fill(5),
        ];
      } else if (updates.children < currentAges.length) {
        // Remove ages for removed children
        newValue.childrenAges = currentAges.slice(0, updates.children);
      }
    }

    onChange(newValue);
  };

  const updateChildAge = (index: number, age: number) => {
    const newAges = [...(currentValue.childrenAges || [])];
    newAges[index] = age;
    onChange({ ...currentValue, childrenAges: newAges });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {question.label}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {question.description}
        </p>
      )}

      <div className="space-y-4">
        {/* Adults */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Adults
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ages 18+
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                updateGroup({ adults: Math.max(1, currentValue.adults - 1) })
              }
              className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentValue.adults <= 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100 w-8 text-center">
              {currentValue.adults}
            </span>
            <button
              onClick={() =>
                updateGroup({ adults: Math.min(20, currentValue.adults + 1) })
              }
              className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Children */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                <Baby className="w-5 h-5 text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Children
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ages 0-17
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  updateGroup({
                    children: Math.max(0, currentValue.children - 1),
                  })
                }
                className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentValue.children <= 0}
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100 w-8 text-center">
                {currentValue.children}
              </span>
              <button
                onClick={() =>
                  updateGroup({
                    children: Math.min(10, currentValue.children + 1),
                  })
                }
                className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-purple-500 hover:text-purple-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Children ages */}
          {currentValue.children > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Children&apos;s ages
              </p>
              <div className="flex flex-wrap gap-3">
                {(currentValue.childrenAges || []).map((age, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Child {index + 1}:
                    </span>
                    <select
                      value={age}
                      onChange={(e) =>
                        updateChildAge(index, parseInt(e.target.value))
                      }
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {Array.from({ length: 18 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? "Under 1" : `${i} years`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <span>🎠</span>
                <span>
                  We&apos;ll suggest kid-friendly activities based on their
                  ages!
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
          {currentValue.adults} adult{currentValue.adults !== 1 ? "s" : ""}
          {currentValue.children > 0 && (
            <span>
              {" "}
              and {currentValue.children} child
              {currentValue.children !== 1 ? "ren" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
