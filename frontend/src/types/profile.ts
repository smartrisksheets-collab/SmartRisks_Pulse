// My profile: the signed-in account's own name and photo (GET /api/v1/me).
export interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}
