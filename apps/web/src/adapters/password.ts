// Matches Supabase's lower_upper_letters_digits policy in both environments.
export const passwordHint =
  "Usá al menos 8 caracteres, una mayúscula, una minúscula y un número.";
export const passwordPattern = "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}";
export function validPassword(value: string) {
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value)
  );
}
