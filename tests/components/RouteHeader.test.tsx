import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteHeader } from "@/components/RouteHeader";

describe("RouteHeader", () => {
  it("renders the title", () => {
    render(<RouteHeader title={<h1>The Nose</h1>} chips={[]} actions={null} />);
    expect(screen.getByRole("heading", { name: "The Nose" })).toBeInTheDocument();
  });

  it("renders one chip per non-empty value", () => {
    const { container } = render(
      <RouteHeader title={<h1>T</h1>} chips={["Yosemite Valley", "5.9 C2"]} actions={null} />,
    );
    expect(container.querySelectorAll(".route-chip")).toHaveLength(2);
    expect(screen.getByText("Yosemite Valley")).toBeInTheDocument();
    expect(screen.getByText("5.9 C2")).toBeInTheDocument();
  });

  it("drops null and empty chips rather than rendering blanks", () => {
    // route_meta is lazily populated, so area and grade are routinely null.
    const { container } = render(
      <RouteHeader title={<h1>T</h1>} chips={[null, "5.9", undefined, ""]} actions={null} />,
    );
    expect(container.querySelectorAll(".route-chip")).toHaveLength(1);
  });

  it("renders actions and children", () => {
    render(
      <RouteHeader title={<h1>T</h1>} chips={[]} actions={<button>Save</button>}>
        <span>updated just now</span>
      </RouteHeader>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("updated just now")).toBeInTheDocument();
  });
});
