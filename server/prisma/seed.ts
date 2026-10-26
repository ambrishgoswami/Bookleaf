/**
 * Seeds the database from the BookLeaf sample dataset.
 *
 * Idempotent: safe to run repeatedly — authors and books are upserted by their
 * dataset codes (AUTH001, BK001), so re-seeding never duplicates records.
 *
 * Demo credentials (documented in the README):
 *   Authors: <email from dataset> / Author@123
 *   Admins:  admin@bookleaf.com / Admin@123, ops@bookleaf.com / Admin@123
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemoTickets } from "./demoTickets.js";

const prisma = new PrismaClient();

const AUTHOR_PASSWORD = "Author@123";
const ADMIN_PASSWORD = "Admin@123";

const ADMINS = [
  { email: "admin@bookleaf.com", name: "Aisha Verma" },
  { email: "ops@bookleaf.com", name: "Karan Mehta" },
];

interface SampleBook {
  book_id: string;
  title: string;
  isbn: string;
  genre: string;
  publication_date: string | null;
  status: string;
  mrp: number;
  author_royalty_per_copy: number;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
}

interface SampleAuthor {
  author_id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joined_date: string;
  books: SampleBook[];
}

const toDate = (value: string | null) => (value ? new Date(value) : null);

function loadDataset(): SampleAuthor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "data", "bookleaf_sample_data.json"), "utf8");
  return (JSON.parse(raw) as { authors: SampleAuthor[] }).authors;
}

async function seedAdmins() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  for (const admin of ADMINS) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { name: admin.name, role: Role.ADMIN },
      create: { ...admin, passwordHash, role: Role.ADMIN },
    });
  }
}

async function seedAuthors(authors: SampleAuthor[]) {
  const passwordHash = await bcrypt.hash(AUTHOR_PASSWORD, 10);

  for (const a of authors) {
    const user = await prisma.user.upsert({
      where: { email: a.email.toLowerCase() },
      update: { name: a.name },
      create: { email: a.email.toLowerCase(), name: a.name, passwordHash, role: Role.AUTHOR },
    });

    const authorFields = { phone: a.phone, city: a.city, joinedDate: new Date(a.joined_date) };
    const author = await prisma.author.upsert({
      where: { code: a.author_id },
      update: authorFields,
      create: { code: a.author_id, userId: user.id, ...authorFields },
    });

    for (const b of a.books) {
      const bookFields = {
        authorId: author.id,
        title: b.title,
        isbn: b.isbn,
        genre: b.genre,
        publicationDate: toDate(b.publication_date),
        status: b.status,
        mrp: b.mrp,
        royaltyPerCopy: b.author_royalty_per_copy,
        copiesSold: b.total_copies_sold,
        royaltyEarned: b.total_royalty_earned,
        royaltyPaid: b.royalty_paid,
        royaltyPending: b.royalty_pending,
        lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date),
        printPartner: b.print_partner,
        availableOn: b.available_on ?? [],
      };
      await prisma.book.upsert({
        where: { code: b.book_id },
        update: bookFields,
        create: { code: b.book_id, ...bookFields },
      });
    }
  }
}

async function main() {
  const authors = loadDataset();
  await seedAdmins();
  await seedAuthors(authors);

  const [users, books] = await Promise.all([prisma.user.count(), prisma.book.count()]);
  console.log(`Seed complete: ${users} users (${authors.length} authors, ${ADMINS.length} admins), ${books} books.`);

  await seedDemoTickets(prisma, ADMINS.map((a) => a.email));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
