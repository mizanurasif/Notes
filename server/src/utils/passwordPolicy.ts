export const PASSWORD_MIN_LENGTH = 8;

// Passwords that appear at the top of every leaked-password list. Attackers try these first,
// so length alone isn't enough (e.g. "password" and "12345678" are 8 characters).
// Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "87654321", "11111111", "00000000",
  "11223344", "12341234", "12121212", "11112222", "88888888", "99999999", "55555555", "66666666",
  "password", "password1", "password12", "password123", "password!", "passw0rd", "p@ssw0rd", "p@ssword",
  "qwertyui", "qwertyuiop", "qwerty123", "qwerty12", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjk",
  "asdfasdf", "zxcvbnm1", "abcd1234", "abc12345", "abcdefgh", "a1b2c3d4", "aa123456", "1234qwer",
  "iloveyou", "iloveyou1", "princess", "sunshine", "football", "baseball", "superman", "starwars",
  "whatever", "trustno1", "letmein1", "welcome1", "welcome123", "admin123", "admin1234", "administrator",
  "changeme", "secret123", "monkey123", "dragon123", "master123", "shadow123", "michael1", "jennifer",
  "computer", "internet", "corvette", "mercedes", "chelsea1", "liverpool", "arsenal1", "pokemon1",
  "qazwsxedc", "q1w2e3r4", "q1w2e3r4t5", "1a2b3c4d", "test1234", "testtest", "user1234", "login123",
  "hello123", "freedom1", "ginger12", "access14", "biteme12", "matrix12", "bangladesh", "pakistan",
]);

// Returns an error message, or null if the password is acceptable
export function checkPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common, please choose another";
  }
  return null;
}
