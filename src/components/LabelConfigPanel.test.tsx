import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LabelConfigPanel from "./LabelConfigPanel";
import type { LabelConfig } from "@/lib/types";

const defaultConfig: LabelConfig = {
  includeProductName: true,
  includeSku: true,
  outputMode: "pdf",
  dpi: 203,
};

describe("LabelConfigPanel", () => {
  it("renders Include Product Name checkbox, checked by default", () => {
    render(
      <LabelConfigPanel config={defaultConfig} onChange={vi.fn()} zplEnabled={false} />
    );
    const checkbox = screen.getByLabelText("Include Product Name") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders Include SKU checkbox, checked by default", () => {
    render(
      <LabelConfigPanel config={defaultConfig} onChange={vi.fn()} zplEnabled={false} />
    );
    const checkbox = screen.getByLabelText("Include SKU") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("calls onChange when Include Product Name is toggled", () => {
    const onChange = vi.fn();
    render(
      <LabelConfigPanel config={defaultConfig} onChange={onChange} zplEnabled={false} />
    );
    fireEvent.click(screen.getByLabelText("Include Product Name"));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultConfig,
      includeProductName: false,
    });
  });

  it("calls onChange when Include SKU is toggled", () => {
    const onChange = vi.fn();
    render(
      <LabelConfigPanel config={defaultConfig} onChange={onChange} zplEnabled={false} />
    );
    fireEvent.click(screen.getByLabelText("Include SKU"));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultConfig,
      includeSku: false,
    });
  });

  it("hides output mode and DPI options when zplEnabled is false", () => {
    render(
      <LabelConfigPanel config={defaultConfig} onChange={vi.fn()} zplEnabled={false} />
    );
    expect(screen.queryByLabelText("PDF")).toBeNull();
    expect(screen.queryByLabelText("ZPL")).toBeNull();
    expect(screen.queryByLabelText("DPI")).toBeNull();
  });

  it("shows output mode toggle when zplEnabled is true", () => {
    render(
      <LabelConfigPanel config={defaultConfig} onChange={vi.fn()} zplEnabled={true} />
    );
    expect(screen.getByLabelText("PDF")).toBeDefined();
    expect(screen.getByLabelText("ZPL")).toBeDefined();
  });

  it("calls onChange with outputMode zpl when ZPL radio is selected", () => {
    const onChange = vi.fn();
    render(
      <LabelConfigPanel config={defaultConfig} onChange={onChange} zplEnabled={true} />
    );
    fireEvent.click(screen.getByLabelText("ZPL"));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultConfig,
      outputMode: "zpl",
    });
  });

  it("shows DPI selector when zplEnabled is true and outputMode is zpl", () => {
    const zplConfig: LabelConfig = { ...defaultConfig, outputMode: "zpl" };
    render(
      <LabelConfigPanel config={zplConfig} onChange={vi.fn()} zplEnabled={true} />
    );
    expect(screen.getByLabelText("DPI")).toBeDefined();
    expect(screen.getByText("203 DPI")).toBeDefined();
    expect(screen.getByText("300 DPI")).toBeDefined();
  });

  it("hides DPI selector when outputMode is pdf even if zplEnabled", () => {
    render(
      <LabelConfigPanel config={defaultConfig} onChange={vi.fn()} zplEnabled={true} />
    );
    expect(screen.queryByLabelText("DPI")).toBeNull();
  });

  it("calls onChange with updated DPI when DPI selector changes", () => {
    const onChange = vi.fn();
    const zplConfig: LabelConfig = { ...defaultConfig, outputMode: "zpl" };
    render(
      <LabelConfigPanel config={zplConfig} onChange={onChange} zplEnabled={true} />
    );
    fireEvent.change(screen.getByLabelText("DPI"), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({
      ...zplConfig,
      dpi: 300,
    });
  });
});
