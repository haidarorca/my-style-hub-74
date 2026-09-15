import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      duration={4500}
      closeButton
      gap={10}
      offset={14}
      swipeDirections={["left", "right", "top"]}
      toastOptions={{
        duration: 4500,
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-[calc(var(--radius)+2px)] group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-[var(--shadow-lift)] group-[.toaster]:backdrop-blur",
          title: "group-[.toast]:font-display group-[.toast]:font-semibold group-[.toast]:tracking-[-0.02em]",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[0.8125rem]",
          actionButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:rounded-full group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
