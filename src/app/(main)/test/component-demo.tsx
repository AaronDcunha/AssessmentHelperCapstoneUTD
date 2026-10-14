"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

export function ComponentDemo() {
  const [text, setText] = useState("Hello from Assessment Helper!");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [semester, setSemester] = useState("fall");
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function resetDemo() {
    setText("Hello from Assessment Helper!");
    setPassword("");
    setShowPassword(false);
    setEmail("");
    setSemester("fall");
    setComments("");
    setSubmitted(false);
  }

  return (
    <div className="space-y-ah-24">
      <p className="text-body text-muted">
        Component playground: try editing the fields and clicking the buttons below.
      </p>

      <Section title="Form fields">
        <form
          className="space-y-ah-24"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            window.alert(`Demo submitted!\nText: ${text}\nEmail: ${email}\nSemester: ${semester}\nComments: ${comments || "(none)"}`);
          }}
          onChange={() => setSubmitted(false)}
        >
          <div className="grid gap-ah-24 md:grid-cols-2">
            <Input label="Regular text" name="message" value={text}
              onChange={(event) => setText(event.target.value)}
              hint="The Show text alert button reads this value." />
            <div className="space-y-ah-8">
              <Input label="Demo password" name="demo-password"
                type={showPassword ? "text" : "password"}
                value={password} onChange={(event) => setPassword(event.target.value)}
                autoComplete="off" placeholder="Type a sample password"
                hint="Characters are masked until you select Show password." />
              <Button variant="secondary" aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? "Hide password" : "Show password"}
              </Button>
            </div>
            <Input label="Read-only text" name="account" value="Faculty account" readOnly
              hint="You can select and copy this text, but cannot edit it." />
            <Input label="Disabled text" name="unavailable" value="Currently unavailable" disabled
              hint="This field cannot be edited or focused." />
            <Input label="Required email" name="email" type="email" required
              value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="faculty@example.edu"
              hint="Try submitting with this empty or with an invalid email." />
            <Select label="Semester" name="semester" value={semester}
              onChange={(event) => setSemester(event.target.value)}>
              <option value="fall">Fall</option>
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
            </Select>
            <Input label="Example error state" name="error-example" defaultValue="Too short"
              error="Example validation message: enter at least 12 characters."
              hint="This field demonstrates the shared error styling." />
          </div>
          <Textarea label="Comments" name="comments" value={comments}
            onChange={(event) => setComments(event.target.value)} maxLength={500}
            hint={`${comments.length}/500 characters`} placeholder="Try a longer response…" />
          <div className="flex flex-wrap gap-ah-12">
            <Button type="submit">Submit demo</Button>
            <Button variant="secondary" onClick={resetDemo}>Reset fields</Button>
          </div>
          <p role="status" className="text-body text-muted">
            {submitted ? "Demo submitted successfully. Values stay on this page; nothing is saved." : "Submit tests the required email field and opens an alert. The error example is only a styling preview."}
          </p>
        </form>
      </Section>

      <Section title="Buttons" description="Edit Regular text above, then show its current value in a browser alert.">
        <div className="flex flex-wrap gap-ah-12">
          <Button onClick={() => window.alert(`Regular text says:\n${text || "(empty)"}`)}>Show text alert</Button>
          <Button variant="secondary" onClick={() => setText("The secondary button changed this text!")}>Change text</Button>
          <Button variant="danger" onClick={() => setText("")}>Clear text</Button>
          <Button disabled>Disabled button</Button>
          <ButtonLink href="/" variant="secondary">Go to home page</ButtonLink>
        </div>
      </Section>
    </div>
  );
}
