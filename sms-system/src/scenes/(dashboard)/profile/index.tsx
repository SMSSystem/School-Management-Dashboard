import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/AuthContext";
import { getRoleLabel, type Role } from "@/lib/firebase";
import {
  parentsData,
  studentsData,
  teachersData,
  activityLogData,
  USE_MOCK,
} from "@/lib/data";
import ProfilePageSkeleton from "@/components/ProfilePageSkeleton";
import ProfileSection from "@/components/profile/ProfileSection";
import ProfileActivitySection from "@/components/profile/ProfileActivitySection";
import ProfileAuditSection from "@/components/profile/ProfileAuditSection";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import { useProfileLoad } from "@/hooks/useProfileLoad";
import {
  buildProfileByRole,
  buildRoleDetails,
  contactSchema,
  fmtDate,
  fmtDateTime,
  mockActivityFor,
  parentRecordFor,
  studentRecordFor,
  teacherRecordFor,
  toFormValue,
  type AuthProfileValues,
  type ContactFormValues,
} from "@/lib/profileLogic";
import { saveContactInfo } from "@/lib/profileSave";
import AccountDetailsFields from "./AccountDetailsFields";
import ContactInfoBody from "./ContactInfoBody";
import ProfileHeader from "./ProfileHeader";
import ProfileLoadError from "./ProfileLoadError";
import RoleDetailsList from "./RoleDetailsList";

const ProfilePage = () => {
  const {
    user,
    role,
    institutionId,
    institution,
    displayName,
    phone: authPhone,
    address: authAddress,
    userStatus,
    department: authDepartment,
    emergencyContact: authEmergencyContact,
    linkedAccounts: authLinkedAccounts,
    photoUrl,
    refreshProfile,
  } = useAuth();

  const { profileLoading, profileLoadError, retryCount, setRetryCount, freshLastSignIn } =
    useProfileLoad(user?.uid);

  // The Activity and "Audit and security events" sections (below) fetch and page
  // their own data (components/profile/): the account's own activity_log, the
  // audit_log entries the account performed (staff), and an institution_admin's
  // security events. The Retry button bumps `retryCount`, which restarts them.

  const currentRole: Role = role ?? "institution_admin";
  const authValues: AuthProfileValues = {
    uid: user?.uid,
    email: user?.email,
    authDisplayName: user?.displayName,
    displayName,
    phone: authPhone,
    address: authAddress,
    department: authDepartment,
    emergencyContact: authEmergencyContact,
    linkedAccounts: authLinkedAccounts,
    photoUrl,
    userStatus,
  };
  const teacher = teacherRecordFor(teachersData[0], authValues);
  const student = studentRecordFor(studentsData[0], authValues);
  const parent = parentRecordFor(parentsData[0], authValues);

  const createdAt = fmtDate(user?.metadata?.creationTime);
  const lastLogin = fmtDateTime(freshLastSignIn ?? user?.metadata?.lastSignInTime);

  const profileByRole = buildProfileByRole({
    a: authValues,
    teacher,
    student,
    parent,
    createdAt,
    lastLogin,
    useMock: USE_MOCK,
  });

  const profile = profileByRole[currentRole];
  const roleLabel = getRoleLabel(currentRole);

  const canEditContactInfo = currentRole === "super_admin";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: toFormValue(profile.name),
      phone: toFormValue(profile.phone),
      emergencyContact: toFormValue(profile.emergencyContact),
    },
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const canonicalizePhone = usePhoneCanonicalizer();

  if (profileLoading) return <ProfilePageSkeleton />;
  if (profileLoadError) return <ProfileLoadError onRetry={() => setRetryCount(c => c + 1)} />;

  const onSubmit = async (values: ContactFormValues) => {
    if (!user?.uid) return;
    setSaveError(null);
    try {
      await saveContactInfo({ uid: user.uid, institutionId, values, canonicalizePhone });
      await refreshProfile();
      reset(values);
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
  };

  const roleDetails = buildRoleDetails({
    teacher,
    student,
    parent,
    authDepartment,
    useMock: USE_MOCK,
  });

  const mockActivity = mockActivityFor({ useMock: USE_MOCK, user, activityLog: activityLogData });

  const isSuper = currentRole === "super_admin";
  const activitySection = (
    <ProfileActivitySection
      uid={user?.uid}
      role={role}
      institutionId={institutionId}
      retryKey={retryCount}
      mockActivity={mockActivity}
    />
  );

  return (
    <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
      <ProfileHeader profile={profile} roleLabel={roleLabel} institution={institution} />

      {/* Every role but super_admin: two columns from 1024 px whose bottoms line up
          (Role-specific Details and Account Details fill their columns), with Activity
          full width below. super_admin keeps the original xl split with Activity in the
          right column. */}
      <div className={`grid grid-cols-12 gap-4 ${isSuper ? "items-start" : "items-stretch"}`}>
        <div className={`col-span-12 ${isSuper ? "xl:col-span-7" : "lg:col-span-7"} flex flex-col gap-4`}>
          <ProfileSection
            title="Contact Information"
            subtitle={
              canEditContactInfo
                ? "Editable: name, phone, emergency contact. View-only: email."
                : "Contact information assigned to this account"
            }
          >
            <ContactInfoBody
              canEditContactInfo={canEditContactInfo}
              profile={profile}
              register={register}
              errors={errors}
              isDirty={isDirty}
              isSubmitting={isSubmitting}
              saveError={saveError}
              onSubmit={handleSubmit(onSubmit)}
              canonicalizePhone={canonicalizePhone}
            />
          </ProfileSection>

          <ProfileSection
            title="Role-specific Details"
            subtitle="Information assigned for the role of this account."
            fill={!isSuper}
          >
            <RoleDetailsList items={roleDetails[currentRole]} />
          </ProfileSection>
        </div>

        <div className={`col-span-12 ${isSuper ? "xl:col-span-5" : "lg:col-span-5"} flex flex-col gap-4`}>
          <ProfileSection
            title="Account Details"
            subtitle="Metadata specific to this account."
            fill={!isSuper}
          >
            <AccountDetailsFields profile={profile} roleLabel={roleLabel} />
          </ProfileSection>

          {isSuper && activitySection}
        </div>
      </div>

      {!isSuper && activitySection}

      <ProfileAuditSection role={role} institutionId={institutionId} retryKey={retryCount} />
    </div>
  );
};

export default ProfilePage;
