import { z } from "@/lib/zod";
import { onlineFormErrors, type ExamOnlineFormValues } from "@/lib/examFormLogic";

// The Add/Edit Exam form's fields. The schedule fields are as they always were; the others are the online-exam
// fields (lib/examFormLogic.ts), checked together by lib/examSettings.ts so the form shows the same messages the
// rules enforce. Nothing about the online fields is checked unless "Online exam" is ticked.
export const examSchema = z
  .object({
    termId: z.string().min(1, "Term is required."),
    subjectId: z.string().min(1, "Subject is required."),
    classId: z.string().min(1, "Class is required."),
    teacherId: z.string().min(1, "Teacher is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().optional(),
    duration: z.string().optional(),
    room: z.string().optional(),
    title: z.string(),
    valueType: z.string(),
    valueTypeLabel: z.string(),
    categoryType: z.string(),
    answerMode: z.string(),
    online: z.boolean(),
    opensAt: z.string(),
    closesAt: z.string(),
    scoringMode: z.string(),
    autoGrade: z.boolean(),
    releaseMode: z.string(),
    releaseAt: z.string(),
    shuffle: z.boolean(),
    checkpointMinutes: z.string(),
  })
  .superRefine((values, ctx) => {
    const online: ExamOnlineFormValues = { ...values, duration: values.duration ?? "" };
    for (const e of onlineFormErrors(online)) ctx.addIssue({ code: "custom", path: [e.path], message: e.message });
  });

export type ExamFormValues = z.infer<typeof examSchema>;
