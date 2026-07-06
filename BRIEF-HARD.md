# 🏁 RACEMAKE PRODUCT ENGINEER CHALLENGE — HARD 🏁

Read this once before you touch the keyboard.

We don't hire from CVs. We hire from what you ship. This is a slice of a real
problem we solve every day: turning a raw telemetry stream into something a
driver can act on. There is no scaffolding and no perfect spec — because there
isn't one in the job either.

**In this pack:** this brief, `stint.telemetry.json` (the data), and
`recorder.rs` (a piece of the recorder). That's everything.
**The data:** download `stint.telemetry.json` here — https://drive.google.com/file/d/1-3ZT9QJBOO3fy-dgr3cIUYnB2dy270uO/view?usp=sharing

---

## The situation

Attached is one stint from a race track — a GT/prototype car, dry. It is the
kind of stream our native recorder actually sends: timestamped frames at a
not-quite-stable rate, straight off the wire.

We are **not** telling you which track it is, and we did not annotate it. Real
telemetry never arrives labelled. Part of what we're testing is whether you
notice what's wrong with it before you compute on top of it. **Trust nothing in
here until you've looked at it.**

You also get a short piece of the recorder itself — in Rust. You don't need to
write Rust. You need to be able to read it, because it explains something about
the data you'll otherwise get wrong.

---

## The floor (this is the minimum, not the target)

Build a small **Bun + Hono** service in **TypeScript** that ingests this stream
and turns it into a race engineer's read on the stint. At minimum:

**0. Read the recorder.** The attached Rust snippet is the code that encodes
these frames. One field is not what it looks like in the raw numbers. Work out
what, and account for it before you compute anything. Tell us what you found.

**1. Clean the stream.** Return a defensible view of how many *real racing laps*
are in here and how long each took. You decide what "real" and "clean" mean —
and you defend it. We did not mark the junk for you.

**2. Find the corners — yourself.** We gave you no sector lines and no corner
positions. A driver doesn't think in thirds of a lap; they think in corners. Cut
the track into corners and split each into **entry / apex / exit**, from the
shape of the lap.

Two things will separate a real answer from a naive one:

- **Not every corner is a braking corner.** Some of the fastest corners in
  racing are taken flat or with a lift, no brake at all. A detector that keys off
  the brake pedal will miss exactly those.
- **A corner is a property of the track, not of the driver.** This stint contains
  the same piece of track driven two different ways — on one lap it's hard on the
  brakes, on another it's taken nearly flat. Your detector must call that the
  **same corner** both times. If you define the apex as "wherever the driver
  slowed down most," you've built something circular that grades the driver
  against himself. Don't.

**3. Localise the loss.** Find the lap that cost the driver the most, locate
**where** on track it went relative to their best lap, and explain **why** from
the telemetry — tyres, inputs, line, consistency, whatever the data actually
supports. Pick your own thresholds and be ready to justify every number you
chose. We will ask.

**4. Say it like an engineer.** Produce the radio call a race engineer would give
the driver — short, direct, specific, numbers not adjectives. The *form* to aim
for (this is an illustration, not the answer to this stint — find your own):

> "Two tenths under braking for the second-gear hairpin — you're locking the
> right front and running the entry deep. Brake ten metres earlier and get it
> slowed before you turn."

This line must be **grounded**. Every claim traces to a number you computed. If
it says something the data doesn't support, that's a fail — in the product and
here. Use an LLM to write it if you like; making sure it can't invent a corner
that wasn't there is the actual engineering. When you're not sure, say so — an
honest "low confidence on T7" beats a confident wrong answer.

---

## How we read your submission

- Did you treat the data as untrusted and handle what's wrong with it, without
  us pointing at it?
- Is the corner detection your own reasoning, or a magic number that fits this
  one track and breaks everywhere else?
- Does the same corner come out the same however it's driven?
- Does the time-loss land on real track, and is the coaching true — can every
  word be traced back to a frame?
- Does the code read like it belongs in a codebase someone else maintains?

Use any tools you want — AI, docs, whatever you'd use on the job. We do. We care
that you understand and can stand behind what you shipped. We will get on a call
and walk your code with you. Be able to explain the parts the AI wrote as if they
were yours — because if you join, they are.

The floor above is what makes it a pass. What you do past the floor is how we
tell a strong engineer from a great one. We are not going to tell you what that
is. If, while building this, you see something obvious that the data is begging
for and the brief didn't ask for — that's the job.

---

## Submit

Send your code + sample output (and anything else you built) to
**weare@racemake.com** — Subject: **RACEMAKE – Engineer – [Your Name]**.

If we see the signal, we'll be in touch within 48 hours.
